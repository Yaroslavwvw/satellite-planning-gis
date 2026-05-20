import json
from sqlalchemy import func

from datetime import timedelta, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session


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
from app.services.orbit_service import generate_satellite_track
from app.services.visibility_service import detect_observation_windows

router = APIRouter(prefix="/api/calculations", tags=["calculations"])

MIN_WINDOW_DURATION_SEC = 120
MIN_OBSERVATION_SCORE = 0.15

def to_db_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value

    return value.astimezone(timezone.utc).replace(tzinfo=None)

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

    aoi_geometry_raw = db.scalar(
        select(func.ST_AsGeoJSON(AOI.geometry)).where(AOI.aoi_id == payload.aoi_id)
    )

    if aoi_geometry_raw is None:
        db.rollback()
        raise HTTPException(status_code=404, detail="AOI geometry not found")

    aoi_geometry = json.loads(aoi_geometry_raw)

    satellites = list(
        db.scalars(
            select(Satellite)
            .where(Satellite.satellite_id.in_(satellite_ids))
            .order_by(Satellite.name)
        )
    )

    missing_tle: list[str] = []
    total_windows = 0

    for satellite in satellites:
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

        sensors = list(
            db.scalars(
                select(Sensor)
                .where(Sensor.satellite_id == satellite.satellite_id)
                .order_by(Sensor.sensor_id)
            )
        )

        if not sensors:
            continue

        try:
            track = generate_satellite_track(
                satellite_name=satellite.name,
                line1=current_tle.line1,
                line2=current_tle.line2,
                start_time=payload.period_start,
                end_time=payload.period_end,
                step_seconds=payload.step_seconds,
            )
        except ValueError as exc:
            db.rollback()
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        for sensor in sensors:
            if sensor.swath_km is None:
                continue

            detected_windows = detect_observation_windows(
                track_points=track,
                aoi_geojson=aoi_geometry,
                swath_km=sensor.swath_km,
                step_seconds=payload.step_seconds,
            )

            for detected_window in detected_windows:
                if detected_window.duration_sec < MIN_WINDOW_DURATION_SEC:
                    continue

                if (
                    detected_window.observation_score is None
                    or detected_window.observation_score < MIN_OBSERVATION_SCORE
                ):
                    continue

                db.add(
                    ObservationWindow(
                        calculation_run_id=run.calculation_run_id,
                        satellite_id=satellite.satellite_id,
                        sensor_id=sensor.sensor_id,
                        aoi_id=payload.aoi_id,
                        access_start=to_db_datetime(detected_window.access_start),
                        access_end=to_db_datetime(detected_window.access_end),
                        duration_sec=detected_window.duration_sec,
                        max_elevation_deg=detected_window.max_elevation_deg,
                        off_nadir_deg=detected_window.off_nadir_deg,
                        observation_score=detected_window.observation_score,
                    )
                )
                total_windows += 1

    if missing_tle:
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail=f"No current TLE for satellites: {', '.join(missing_tle)}",
        )

    db.commit()
    db.refresh(run)

    placeholder = {
        "status": "calculated",
        "summary": "Observation windows were generated using SGP4 track and AOI visibility approximation.",
        "result_url": f"/calculations/{run.calculation_run_id}/results",
        "satellites_used": [satellite.name for satellite in satellites],
        "windows_created": total_windows,
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
        .select_from(ObservationWindow)     
        .join(
            Satellite,
            Satellite.satellite_id == ObservationWindow.satellite_id,
        )
        .join(
            Sensor,
            Sensor.sensor_id == ObservationWindow.sensor_id,
        )
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

    satellite_ids = list(
        db.scalars(
            select(CalculationRunSatellite.satellite_id)
            .where(CalculationRunSatellite.calculation_run_id == calculation_run_id)
            .distinct()
            .order_by(CalculationRunSatellite.satellite_id)
        )
    )

    return CalculationResultResponse(
        calculation_run=CalculationRead.model_validate(run),
        aoi=CalculationAoiRead(
            aoi_id=aoi_row.aoi_id,
            name=aoi_row.name,
            geometry=json.loads(aoi_row.geometry),
        ),
        satellite_ids=satellite_ids,
        windows=windows,
    )