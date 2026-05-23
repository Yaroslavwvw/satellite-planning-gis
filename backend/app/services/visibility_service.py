from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from math import atan, degrees
from typing import Any

from pyproj import Transformer
from shapely.geometry import Point, shape
from shapely.geometry import LineString
from shapely.ops import transform


@dataclass
class DetectedObservationWindow:
    access_start: datetime
    access_end: datetime
    duration_sec: int
    max_elevation_deg: float | None
    off_nadir_deg: float | None
    observation_score: float | None


def _parse_datetime(value: str) -> datetime:
    return datetime.fromisoformat(value)


def _get_utm_epsg(longitude: float, latitude: float) -> int:
    zone = int((longitude + 180) / 6) + 1
    return 32600 + zone if latitude >= 0 else 32700 + zone


def _project_geometry_to_local_meters(aoi_geojson: dict[str, Any]):
    aoi_geometry = shape(aoi_geojson)
    centroid = aoi_geometry.centroid

    epsg = _get_utm_epsg(centroid.x, centroid.y)

    transformer = Transformer.from_crs(
        "EPSG:4326",
        f"EPSG:{epsg}",
        always_xy=True,
    )

    projected_aoi = transform(transformer.transform, aoi_geometry)

    return projected_aoi, transformer


def _calculate_metrics(distance_km: float, altitude_km: float, half_swath_km: float):
    if altitude_km <= 0:
        off_nadir_deg = None
        max_elevation_deg = None
    else:
        off_nadir_deg = degrees(atan(distance_km / altitude_km))
        max_elevation_deg = max(0.0, 90.0 - off_nadir_deg)

    if half_swath_km <= 0:
        score = None
    else:
        score = max(0.0, min(1.0, 1.0 - distance_km / half_swath_km))

    return (
        round(max_elevation_deg, 2) if max_elevation_deg is not None else None,
        round(off_nadir_deg, 2) if off_nadir_deg is not None else None,
        round(score, 3) if score is not None else None,
    )


def detect_observation_windows(
    track_points: list[dict[str, Any]],
    aoi_geojson: dict[str, Any],
    swath_km: float | None,
    step_seconds: int,
) -> list[DetectedObservationWindow]:
    if not track_points:
        return []

    if swath_km is None:
        return []

    swath_km_float = float(swath_km)

    if swath_km_float <= 0:
        return []

    if step_seconds <= 0:
        raise ValueError("step_seconds must be greater than 0")

    projected_aoi, transformer = _project_geometry_to_local_meters(aoi_geojson)

    half_swath_m = (swath_km_float * 1000.0) / 2.0
    half_swath_km = swath_km_float / 2.0

    visible_points: list[dict[str, Any]] = []

    for point in track_points:
        longitude = point["longitude"]
        latitude = point["latitude"]

        x, y = transformer.transform(longitude, latitude)
        projected_point = Point(x, y)

        distance_m = projected_point.distance(projected_aoi)

        if distance_m <= half_swath_m:
            distance_km = distance_m / 1000.0
            altitude_km = float(point.get("altitude_km") or 0)

            max_elevation_deg, off_nadir_deg, score = _calculate_metrics(
                distance_km=distance_km,
                altitude_km=altitude_km,
                half_swath_km=half_swath_km,
            )

            visible_points.append(
                {
                    "time": _parse_datetime(point["time_utc"]),
                    "distance_km": distance_km,
                    "max_elevation_deg": max_elevation_deg,
                    "off_nadir_deg": off_nadir_deg,
                    "observation_score": score,
                }
            )

    if not visible_points:
        return []

    windows: list[DetectedObservationWindow] = []

    current_start = visible_points[0]["time"]
    current_end = visible_points[0]["time"] + timedelta(seconds=step_seconds)
    current_scores: list[float] = []
    current_off_nadir_values: list[float] = []
    current_elevation_values: list[float] = []

    def add_metrics(point: dict[str, Any]):
        if point["observation_score"] is not None:
            current_scores.append(point["observation_score"])
        if point["off_nadir_deg"] is not None:
            current_off_nadir_values.append(point["off_nadir_deg"])
        if point["max_elevation_deg"] is not None:
            current_elevation_values.append(point["max_elevation_deg"])

    add_metrics(visible_points[0])

    for point in visible_points[1:]:
        point_time = point["time"]
        gap_seconds = (point_time - current_end).total_seconds()

        if gap_seconds <= step_seconds * 1.5:
            current_end = point_time + timedelta(seconds=step_seconds)
            add_metrics(point)
        else:
            duration_sec = int((current_end - current_start).total_seconds())

            windows.append(
                DetectedObservationWindow(
                    access_start=current_start,
                    access_end=current_end,
                    duration_sec=duration_sec,
                    max_elevation_deg=max(current_elevation_values)
                    if current_elevation_values
                    else None,
                    off_nadir_deg=min(current_off_nadir_values)
                    if current_off_nadir_values
                    else None,
                    observation_score=max(current_scores) if current_scores else None,
                )
            )

            current_start = point_time
            current_end = point_time + timedelta(seconds=step_seconds)
            current_scores = []
            current_off_nadir_values = []
            current_elevation_values = []
            add_metrics(point)

    duration_sec = int((current_end - current_start).total_seconds())

    windows.append(
        DetectedObservationWindow(
            access_start=current_start,
            access_end=current_end,
            duration_sec=duration_sec,
            max_elevation_deg=max(current_elevation_values)
            if current_elevation_values
            else None,
            off_nadir_deg=min(current_off_nadir_values)
            if current_off_nadir_values
            else None,
            observation_score=max(current_scores) if current_scores else None,
        )
    )


    return windows


def _to_naive_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value

    return value.astimezone(timezone.utc).replace(tzinfo=None)


def calculate_coverage_percent(
    track_points: list[dict[str, Any]],
    aoi_geojson: dict[str, Any],
    swath_km: float | None,
    access_start: datetime,
    access_end: datetime,
) -> float | None:
    if not track_points:
        return None

    if swath_km is None:
        return None

    swath_km_float = float(swath_km)

    if swath_km_float <= 0:
        return None

    projected_aoi, transformer = _project_geometry_to_local_meters(aoi_geojson)

    if projected_aoi.area <= 0:
        return None

    start_time = _to_naive_utc(access_start)
    end_time = _to_naive_utc(access_end)

    local_coordinates: list[tuple[float, float]] = []

    for point in track_points:
        point_time = _to_naive_utc(_parse_datetime(point["time_utc"]))

        if point_time < start_time or point_time > end_time:
            continue

        longitude = point["longitude"]
        latitude = point["latitude"]

        x, y = transformer.transform(longitude, latitude)
        local_coordinates.append((x, y))

    if len(local_coordinates) < 2:
        return None

    line = LineString(local_coordinates)

    half_swath_m = (swath_km_float * 1000.0) / 2.0

    corridor = line.buffer(
        half_swath_m,
        cap_style=2,
        join_style=2,
    )

    if corridor.is_empty:
        return None

    intersection = corridor.intersection(projected_aoi)

    if intersection.is_empty:
        return 0.0

    coverage = (intersection.area / projected_aoi.area) * 100.0

    coverage = max(0.0, min(100.0, coverage))

    return round(coverage, 2)