from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session
import json
from sqlalchemy import func

from app.core.database import get_db
from app.models.aoi import AOI
from app.models.calculation_run import CalculationRun
from app.models.calculation_run_satellite import CalculationRunSatellite
from app.models.observation_window import ObservationWindow
from app.models.satellite import Satellite
from app.models.sensor import Sensor
from app.models.tle_record import TLERecord
from app.schemas.calculation import (
    CalculationAoiRead,
    CalculationCreate,
    CalculationPlaceholderResponse,
    CalculationRead,
    CalculationResultResponse,
    ObservationWindowRead,
)

router = APIRouter(prefix="/api/calculations", tags=["calculations"])


@router.post("", response_model=CalculationPlaceholderResponse)
def create_calculation(payload: CalculationCreate, db: Session = Depends(get_db)):
    aoi = db.get(AOI, payload.aoi_id)
    if aoi is None:
        raise HTTPException(status_code=404, detail="AOI not found")

    if payload.mode == "selected":
        if not payload.satellite_ids:
            raise HTTPException(
                status_code=400,
                detail="satellite_ids is required when mode='selected'",
            )
        satellite_ids = payload.satellite_ids
    else:
        satellite_ids = list(db.scalars(select(Satellite.satellite_id)))

    if not satellite_ids:
        raise HTTPException(status_code=400, detail="No satellites selected")

    run = CalculationRun(
        aoi_id=payload.aoi_id,
        period_start=payload.period_start,
        period_end=payload.period_end,
        step_seconds=payload.step_seconds,
        mode=payload.mode,
        status="completed",
    )

    db.add(run)
    db.flush()

    missing_tle: list[str] = []

    satellites = list(
        db.scalars(
            select(Satellite)
            .where(Satellite.satellite_id.in_(satellite_ids))
            .order_by(Satellite.name)
        )
    )

    for index, satellite in enumerate(satellites):
        current_tle = db.scalar(
            select(TLERecord)
            .where(TLERecord.satellite_id == satellite.satellite_id)
            .where(TLERecord.is_current.is_(True))
        )

        if current_tle is None:
            missing_tle.append(satellite.name)
            continue

        db.add(
            CalculationRunSatellite(
                calculation_run_id=run.calculation_run_id,
                satellite_id=satellite.satellite_id,
                tle_id=current_tle.tle_id,
                included_manually=(payload.mode == "selected"),
            )
        )

        sensor = db.scalar(
            select(Sensor)
            .where(Sensor.satellite_id == satellite.satellite_id)
            .order_by(Sensor.sensor_id)
        )

        if sensor is None:
            continue

        window_start = payload.period_start + timedelta(hours=index * 3 + 1)
        window_end = window_start + timedelta(minutes=5)

        if window_end <= payload.period_end:
            db.add(
                ObservationWindow(
                    calculation_run_id=run.calculation_run_id,
                    satellite_id=satellite.satellite_id,
                    sensor_id=sensor.sensor_id,
                    aoi_id=payload.aoi_id,
                    access_start=window_start,
                    access_end=window_end,
                    duration_sec=300,
                    max_elevation_deg=55.0,
                    off_nadir_deg=12.0,
                    observation_score=0.75,
                )
            )

    if missing_tle:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail=f"No current TLE for satellites: {', '.join(missing_tle)}",
        )

    db.commit()
    db.refresh(run)

    placeholder = {
        "status": "placeholder",
        "summary": "Calculation run created. Temporary observation windows were generated for prototype UI testing.",
        "result_url": f"/calculations/{run.calculation_run_id}/results",
        "satellites_used": [satellite.name for satellite in satellites],
    }

    return CalculationPlaceholderResponse(
        calculation_run=CalculationRead.model_validate(run),
        placeholder=placeholder,
    )


@router.get("/{calculation_run_id}", response_model=CalculationRead)
def get_calculation(calculation_run_id: int, db: Session = Depends(get_db)):
    run = db.get(CalculationRun, calculation_run_id)

    if run is None:
        raise HTTPException(status_code=404, detail="Calculation run not found")

    return run


@router.get("/{calculation_run_id}/results", response_model=CalculationResultResponse)
def get_calculation_results(calculation_run_id: int, db: Session = Depends(get_db)):
    run = db.get(CalculationRun, calculation_run_id)

    if run is None:
        raise HTTPException(status_code=404, detail="Calculation run not found")

    aoi_row = db.execute(
        select(
            AOI.aoi_id,
            AOI.name,
            func.ST_AsGeoJSON(AOI.geometry).label("geometry"),
        )
        .where(AOI.aoi_id == run.aoi_id)
    ).one_or_none()

    if aoi_row is None:
        raise HTTPException(status_code=404, detail="AOI not found for calculation")

    rows = db.execute(
        select(
            ObservationWindow,
            Satellite.name.label("satellite_name"),
            Sensor.name.label("sensor_name"),
        )
        .join(Satellite, Satellite.satellite_id == ObservationWindow.satellite_id)
        .join(Sensor, Sensor.sensor_id == ObservationWindow.sensor_id)
        .where(ObservationWindow.calculation_run_id == calculation_run_id)
        .order_by(ObservationWindow.access_start)
    ).all()

    windows = [
        ObservationWindowRead(
            window_id=row.ObservationWindow.window_id,
            calculation_run_id=row.ObservationWindow.calculation_run_id,
            satellite_id=row.ObservationWindow.satellite_id,
            satellite_name=row.satellite_name,
            sensor_id=row.ObservationWindow.sensor_id,
            sensor_name=row.sensor_name,
            aoi_id=row.ObservationWindow.aoi_id,
            access_start=row.ObservationWindow.access_start,
            access_end=row.ObservationWindow.access_end,
            duration_sec=row.ObservationWindow.duration_sec,
            max_elevation_deg=row.ObservationWindow.max_elevation_deg,
            off_nadir_deg=row.ObservationWindow.off_nadir_deg,
            observation_score=row.ObservationWindow.observation_score,
        )
        for row in rows
    ]

    return CalculationResultResponse(
        calculation_run=CalculationRead.model_validate(run),
        aoi=CalculationAoiRead(
            aoi_id=aoi_row.aoi_id,
            name=aoi_row.name,
            geometry=json.loads(aoi_row.geometry),
        ),
        windows=windows,
    )