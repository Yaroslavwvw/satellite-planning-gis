import json
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.core.database import get_db
from app.models.aoi import AOI
from app.models.calculation_run import CalculationRun
from app.models.calculation_run_satellite import CalculationRunSatellite
from app.models.observation_window import ObservationWindow
from app.models.satellite import Satellite
from app.models.sensor import Sensor
from app.models.sensor_mode import SensorMode
from app.models.tle_record import TLERecord
from app.schemas.calculation import (
    CalculationAoiRead,
    CalculationCreate,
    CalculationPlaceholderResponse,
    CalculationRead,
    CalculationResultResponse,
    FootprintLayerRead,
    ObservationWindowRead,
    TrackLayerRead,
    WindowMapLayerResponse,
)
from app.services.map_layers_service import (
    build_footprint_corridor_geojson,
    build_reachable_footprint_corridor_geojson,
    build_track_line_geojson,
    calculate_footprint_coverage_details,
    select_track_segment_near_aoi,
)
from app.services.orbit_service import generate_satellite_track
from app.services.solar_service import is_daylight_required_for_sensor
from app.services.visibility_service import (
    calculate_reachable_coverage_percent,
    detect_observation_windows,
)

router = APIRouter(prefix="/api/calculations", tags=["calculations"])

MIN_WINDOW_DURATION_SEC = 30
MIN_OBSERVATION_SCORE = 0

WINDOW_LAYER_PADDING_MINUTES = 5
WINDOW_LAYER_STEP_SECONDS = 120
MIN_COVERAGE_PERCENT = 0.1


def get_sensor_modes_for_calculation(sensor: Sensor) -> list[SensorMode | None]:
    modes = getattr(sensor, "modes", None) or []

    if modes:
        return sorted(
            modes,
            key=lambda mode: (
                not mode.is_default,
                mode.sensor_mode_id,
            ),
        )

    return [None]


def get_mode_swath_km(sensor: Sensor, mode: SensorMode | None) -> float | None:
    if mode is not None and mode.swath_km is not None:
        return mode.swath_km

    return sensor.swath_km


def get_mode_max_off_nadir_deg(
    sensor: Sensor,
    mode: SensorMode | None,
) -> float | None:
    if mode is not None and mode.max_off_nadir_deg is not None:
        return mode.max_off_nadir_deg

    return sensor.max_off_nadir_deg


def get_mode_id(mode: SensorMode | None) -> int | None:
    if mode is None:
        return None

    return mode.sensor_mode_id


def get_window_swath_km(window: ObservationWindow, sensor: Sensor) -> float | None:
    if window.swath_km is not None:
        return window.swath_km

    return sensor.swath_km


def to_db_datetime(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value

    return value.astimezone(timezone.utc).replace(tzinfo=None)


def build_window_layer_and_coverage(
    satellite: Satellite,
    sensor: Sensor,
    tle_record: TLERecord,
    aoi_geometry: dict,
    access_start: datetime,
    access_end: datetime,
    swath_km: float | None = None,
):
    effective_swath_km = swath_km if swath_km is not None else sensor.swath_km

    segment_start = access_start - timedelta(minutes=WINDOW_LAYER_PADDING_MINUTES)
    segment_end = access_end + timedelta(minutes=WINDOW_LAYER_PADDING_MINUTES)

    track_points = generate_satellite_track(
        satellite_name=satellite.name,
        line1=tle_record.line1,
        line2=tle_record.line2,
        start_time=segment_start,
        end_time=segment_end,
        step_seconds=WINDOW_LAYER_STEP_SECONDS,
    )

    local_track_points = select_track_segment_near_aoi(
        track_points=track_points,
        aoi_geojson=aoi_geometry,
        points_before=3,
        points_after=3,
    )

    if len(local_track_points) < 2:
        coverage_details = calculate_footprint_coverage_details(
            aoi_geojson=aoi_geometry,
            footprint_geojson=None,
        )

        return None, None, coverage_details

    track_geometry = build_track_line_geojson(
        track_points=local_track_points,
        aoi_geojson=aoi_geometry,
    )

    footprint_geometry = build_footprint_corridor_geojson(
        track_points=local_track_points,
        aoi_geojson=aoi_geometry,
        swath_km=effective_swath_km,
    )

    coverage_details = calculate_footprint_coverage_details(
        aoi_geojson=aoi_geometry,
        footprint_geojson=footprint_geometry,
    )

    track = None

    if track_geometry is not None:
        track = TrackLayerRead(
            satellite_id=satellite.satellite_id,
            satellite_name=satellite.name,
            geometry=track_geometry,
        )

    footprint = None

    if footprint_geometry is not None:
        footprint = FootprintLayerRead(
            satellite_id=satellite.satellite_id,
            satellite_name=satellite.name,
            sensor_id=sensor.sensor_id,
            sensor_name=sensor.name,
            swath_km=(
                float(effective_swath_km)
                if effective_swath_km is not None
                else None
            ),
            geometry=footprint_geometry,
        )

    return track, footprint, coverage_details


def build_reachable_window_footprint_layer(
    satellite: Satellite,
    sensor: Sensor,
    tle_record: TLERecord,
    aoi_geometry: dict,
    access_start: datetime,
    access_end: datetime,
    swath_km: float | None,
    max_off_nadir_deg: float | None,
):
    segment_start = access_start - timedelta(minutes=WINDOW_LAYER_PADDING_MINUTES)
    segment_end = access_end + timedelta(minutes=WINDOW_LAYER_PADDING_MINUTES)

    track_points = generate_satellite_track(
        satellite_name=satellite.name,
        line1=tle_record.line1,
        line2=tle_record.line2,
        start_time=segment_start,
        end_time=segment_end,
        step_seconds=WINDOW_LAYER_STEP_SECONDS,
    )

    local_track_points = select_track_segment_near_aoi(
        track_points=track_points,
        aoi_geojson=aoi_geometry,
        points_before=3,
        points_after=3,
    )

    if len(local_track_points) < 2:
        return None

    reachable_geometry = build_reachable_footprint_corridor_geojson(
        track_points=local_track_points,
        aoi_geojson=aoi_geometry,
        swath_km=swath_km,
        max_off_nadir_deg=max_off_nadir_deg,
    )

    if reachable_geometry is None:
        return None

    return FootprintLayerRead(
        satellite_id=satellite.satellite_id,
        satellite_name=satellite.name,
        sensor_id=sensor.sensor_id,
        sensor_name=f"{sensor.name} — зона возможного наведения",
        swath_km=float(swath_km) if swath_km is not None else None,
        geometry=reachable_geometry,
    )


@router.post("", response_model=CalculationPlaceholderResponse)
def create_calculation(payload: CalculationCreate, db: Session = Depends(get_db)):
    aoi = db.get(AOI, payload.aoi_id)

    if aoi is None:
        raise HTTPException(status_code=404, detail="AOI not found")

    today = datetime.now(timezone.utc).date()

    if payload.period_start.date() < today:
        raise HTTPException(
            status_code=400,
            detail="period_start cannot be earlier than current date",
        )

    if payload.mode == "selected":
        if not payload.satellite_ids:
            raise HTTPException(
                status_code=400,
                detail="satellite_ids is required when mode='selected'",
            )

        satellite_ids = payload.satellite_ids
    else:
        satellite_ids = list(
            db.scalars(
                select(Satellite.satellite_id).order_by(Satellite.satellite_id)
            )
        )

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

    if not satellites:
        db.rollback()
        raise HTTPException(status_code=400, detail="Selected satellites not found")

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
                .options(selectinload(Sensor.modes))
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
            daylight_required = is_daylight_required_for_sensor(sensor.sensor_type)

            for sensor_mode in get_sensor_modes_for_calculation(sensor):
                mode_swath_km = get_mode_swath_km(sensor, sensor_mode)
                mode_max_off_nadir_deg = get_mode_max_off_nadir_deg(
                    sensor,
                    sensor_mode,
                )

                if mode_swath_km is None:
                    continue

                detected_windows = detect_observation_windows(
                    track_points=track,
                    aoi_geojson=aoi_geometry,
                    swath_km=mode_swath_km,
                    step_seconds=payload.step_seconds,
                    max_off_nadir_deg=mode_max_off_nadir_deg,
                )

                for detected_window in detected_windows:
                    if daylight_required and not detected_window.is_daylight:
                        continue

                    if detected_window.duration_sec < MIN_WINDOW_DURATION_SEC:
                        continue

                    if (
                        detected_window.observation_score is None
                        or detected_window.observation_score < MIN_OBSERVATION_SCORE
                    ):
                        continue

                    try:
                        _, _, coverage_details = build_window_layer_and_coverage(
                            satellite=satellite,
                            sensor=sensor,
                            tle_record=current_tle,
                            aoi_geometry=aoi_geometry,
                            access_start=detected_window.access_start,
                            access_end=detected_window.access_end,
                            swath_km=mode_swath_km,
                        )
                    except ValueError:
                        coverage_details = {"coverage_percent": None}

                    coverage_percent = coverage_details["coverage_percent"]

                    reachable_coverage_percent = calculate_reachable_coverage_percent(
                        track_points=track,
                        aoi_geojson=aoi_geometry,
                        swath_km=mode_swath_km,
                        max_off_nadir_deg=detected_window.max_off_nadir_deg,
                        access_start=detected_window.access_start,
                        access_end=detected_window.access_end,
                    )

                    coverage_for_filter = (
                        reachable_coverage_percent
                        if detected_window.requires_pointing
                        else coverage_percent
                    )

                    if (
                        coverage_for_filter is None
                        or coverage_for_filter < MIN_COVERAGE_PERCENT
                    ):
                        continue

                    db.add(
                        ObservationWindow(
                            calculation_run_id=run.calculation_run_id,
                            satellite_id=satellite.satellite_id,
                            sensor_id=sensor.sensor_id,
                            sensor_mode_id=get_mode_id(sensor_mode),
                            aoi_id=payload.aoi_id,
                            access_start=to_db_datetime(detected_window.access_start),
                            access_end=to_db_datetime(detected_window.access_end),
                            duration_sec=detected_window.duration_sec,
                            max_elevation_deg=detected_window.max_elevation_deg,
                            off_nadir_deg=detected_window.off_nadir_deg,
                            observation_score=detected_window.observation_score,
                            coverage_percent=coverage_percent,
                            swath_km=mode_swath_km,
                            sun_elevation_deg=detected_window.sun_elevation_deg,
                            is_daylight=detected_window.is_daylight,
                            daylight_required=daylight_required,
                            max_off_nadir_deg=detected_window.max_off_nadir_deg,
                            required_off_nadir_deg=(
                                detected_window.required_off_nadir_deg
                            ),
                            requires_pointing=detected_window.requires_pointing,
                            reachable_coverage_percent=reachable_coverage_percent,
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
        "summary": (
            "Observation windows were generated using SGP4 track and AOI "
            "visibility approximation."
        ),
        "result_url": f"/api/calculations/{run.calculation_run_id}/results",
        "satellites_used": [satellite.name for satellite in satellites],
        "windows_created": total_windows,
    }

    return CalculationPlaceholderResponse(
        calculation_run=CalculationRead.model_validate(run),
        placeholder=placeholder,
    )


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

    aoi_geometry = json.loads(aoi_row.geometry)

    rows = db.execute(
        select(
            ObservationWindow,
            Satellite.name.label("satellite_name"),
            Sensor.name.label("sensor_name"),
            SensorMode.mode_name.label("sensor_mode_name"),
        )
        .select_from(ObservationWindow)
        .join(Satellite, Satellite.satellite_id == ObservationWindow.satellite_id)
        .join(Sensor, Sensor.sensor_id == ObservationWindow.sensor_id)
        .outerjoin(
            SensorMode,
            SensorMode.sensor_mode_id == ObservationWindow.sensor_mode_id,
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
            sensor_mode_id=row.ObservationWindow.sensor_mode_id,
            sensor_mode_name=row.sensor_mode_name,
            aoi_id=row.ObservationWindow.aoi_id,
            access_start=row.ObservationWindow.access_start,
            access_end=row.ObservationWindow.access_end,
            duration_sec=row.ObservationWindow.duration_sec,
            max_elevation_deg=row.ObservationWindow.max_elevation_deg,
            off_nadir_deg=row.ObservationWindow.off_nadir_deg,
            observation_score=row.ObservationWindow.observation_score,
            coverage_percent=row.ObservationWindow.coverage_percent,
            swath_km=row.ObservationWindow.swath_km,
            sun_elevation_deg=row.ObservationWindow.sun_elevation_deg,
            is_daylight=row.ObservationWindow.is_daylight,
            daylight_required=row.ObservationWindow.daylight_required,
            max_off_nadir_deg=row.ObservationWindow.max_off_nadir_deg,
            required_off_nadir_deg=row.ObservationWindow.required_off_nadir_deg,
            requires_pointing=row.ObservationWindow.requires_pointing,
            reachable_coverage_percent=(
                row.ObservationWindow.reachable_coverage_percent
            ),
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
            geometry=aoi_geometry,
        ),
        satellite_ids=satellite_ids,
        windows=windows,
        tracks=[],
        footprints=[],
    )


@router.get(
    "/{calculation_run_id}/windows/{window_id}/map-layer",
    response_model=WindowMapLayerResponse,
)
def get_window_map_layer(
    calculation_run_id: int,
    window_id: int,
    db: Session = Depends(get_db),
):
    run = db.get(CalculationRun, calculation_run_id)

    if run is None:
        raise HTTPException(status_code=404, detail="Calculation run not found")

    window = db.scalar(
        select(ObservationWindow)
        .where(ObservationWindow.calculation_run_id == calculation_run_id)
        .where(ObservationWindow.window_id == window_id)
    )

    if window is None:
        raise HTTPException(status_code=404, detail="Observation window not found")

    satellite = db.get(Satellite, window.satellite_id)

    if satellite is None:
        raise HTTPException(status_code=404, detail="Satellite not found")

    sensor = db.get(Sensor, window.sensor_id)

    if sensor is None:
        raise HTTPException(status_code=404, detail="Sensor not found")

    calculation_satellite = db.scalar(
        select(CalculationRunSatellite)
        .where(CalculationRunSatellite.calculation_run_id == calculation_run_id)
        .where(CalculationRunSatellite.satellite_id == window.satellite_id)
    )

    if calculation_satellite is None:
        raise HTTPException(
            status_code=404,
            detail="Calculation satellite relation not found",
        )

    tle_record = db.get(TLERecord, calculation_satellite.tle_id)

    if tle_record is None:
        raise HTTPException(status_code=404, detail="TLE record not found")

    aoi_geometry_raw = db.scalar(
        select(func.ST_AsGeoJSON(AOI.geometry)).where(AOI.aoi_id == window.aoi_id)
    )

    if aoi_geometry_raw is None:
        raise HTTPException(status_code=404, detail="AOI geometry not found")

    aoi_geometry = json.loads(aoi_geometry_raw)
    window_swath_km = get_window_swath_km(window, sensor)

    try:
        track, footprint, coverage_details = build_window_layer_and_coverage(
            satellite=satellite,
            sensor=sensor,
            tle_record=tle_record,
            aoi_geometry=aoi_geometry,
            access_start=window.access_start,
            access_end=window.access_end,
            swath_km=window_swath_km,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    reachable_footprint = None

    if window.requires_pointing:
        reachable_footprint = build_reachable_window_footprint_layer(
            satellite=satellite,
            sensor=sensor,
            tle_record=tle_record,
            aoi_geometry=aoi_geometry,
            access_start=window.access_start,
            access_end=window.access_end,
            swath_km=window_swath_km,
            max_off_nadir_deg=window.max_off_nadir_deg,
        )

    return WindowMapLayerResponse(
        window_id=window.window_id,
        calculation_run_id=calculation_run_id,
        track=track,
        footprint=footprint,
        reachable_footprint=reachable_footprint,
        saved_coverage_percent=window.coverage_percent,
        computed_coverage_percent=coverage_details["coverage_percent"],
        aoi_area_km2=coverage_details["aoi_area_km2"],
        footprint_area_km2=coverage_details["footprint_area_km2"],
        intersection_area_km2=coverage_details["intersection_area_km2"],
    )