from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from math import atan, degrees, radians, tan
from typing import Any

from pyproj import Transformer
from shapely.geometry import LineString, Point, shape
from shapely.ops import transform

from app.services.solar_service import calculate_window_solar_illumination


@dataclass
class DetectedObservationWindow:
    access_start: datetime
    access_end: datetime
    duration_sec: int
    max_elevation_deg: float | None
    off_nadir_deg: float | None
    observation_score: float | None
    sun_elevation_deg: float | None = None
    is_daylight: bool | None = None
    max_off_nadir_deg: float | None = None
    required_off_nadir_deg: float | None = None
    required_off_nadir_max_deg: float | None = None
    requires_pointing: bool = False
    sar_min_look_angle_deg: float | None = None
    sar_max_look_angle_deg: float | None = None
    sar_look_direction: str | None = None


def _parse_datetime(value: str) -> datetime:
    return datetime.fromisoformat(value)


def _get_utm_epsg(longitude: float, latitude: float) -> int:
    zone = int((longitude + 180) / 6) + 1
    return 32600 + zone if latitude >= 0 else 32700 + zone


def _project_geometry_to_local_meters(aoi_geojson: dict[str, Any]):
    aoi_geometry = shape(aoi_geojson)
    centroid = aoi_geometry.centroid

    center_lon = centroid.x
    center_lat = centroid.y

    local_crs = (
        f"+proj=aeqd +lat_0={center_lat} +lon_0={center_lon} "
        "+datum=WGS84 +units=m +no_defs"
    )

    transformer = Transformer.from_crs(
        "EPSG:4326",
        local_crs,
        always_xy=True,
    )

    projected_geometry = transform(transformer.transform, aoi_geometry)

    return projected_geometry, transformer


def _normalize_max_off_nadir_deg(value: float | None) -> float | None:
    if value is None:
        return None

    value_float = float(value)

    if value_float <= 0:
        return None

    return value_float


def _calculate_max_side_shift_km(
    altitude_km: float,
    max_off_nadir_deg: float | None,
) -> float:
    if altitude_km <= 0:
        return 0.0

    normalized_max_off_nadir_deg = _normalize_max_off_nadir_deg(max_off_nadir_deg)

    if normalized_max_off_nadir_deg is None:
        return 0.0

    return altitude_km * tan(radians(normalized_max_off_nadir_deg))

def _iter_projected_geometry_coordinates(geometry):
    if geometry.is_empty:
        return

    if geometry.geom_type == "Point":
        yield geometry.x, geometry.y
        return

    if geometry.geom_type in {"LineString", "LinearRing"}:
        yield from geometry.coords
        return

    if geometry.geom_type == "Polygon":
        yield from geometry.exterior.coords

        for interior in geometry.interiors:
            yield from interior.coords

        return

    if hasattr(geometry, "geoms"):
        for item in geometry.geoms:
            yield from _iter_projected_geometry_coordinates(item)


def _calculate_aoi_distance_range_km(
    projected_point: Point,
    projected_aoi,
) -> tuple[float, float]:
    nearest_distance_km = projected_point.distance(projected_aoi) / 1000.0

    farthest_distance_m: float | None = None

    for x, y in _iter_projected_geometry_coordinates(projected_aoi):
        distance_m = projected_point.distance(Point(x, y))

        if farthest_distance_m is None or distance_m > farthest_distance_m:
            farthest_distance_m = distance_m

    if farthest_distance_m is None:
        farthest_distance_m = projected_point.distance(projected_aoi.centroid)

    farthest_distance_km = farthest_distance_m / 1000.0

    if farthest_distance_km < nearest_distance_km:
        farthest_distance_km = nearest_distance_km

    return nearest_distance_km, farthest_distance_km


def _calculate_required_off_nadir_range_deg(
    nearest_distance_km: float,
    farthest_distance_km: float,
    altitude_km: float,
    half_swath_km: float,
    max_off_nadir_deg: float | None,
) -> tuple[float | None, float | None]:
    if altitude_km <= 0:
        return None, None

    if half_swath_km <= 0:
        return None, None

    nearest_distance = max(0.0, nearest_distance_km)
    farthest_distance = max(nearest_distance, farthest_distance_km)

    min_shift_km = max(0.0, nearest_distance - half_swath_km)
    max_required_shift_km = max(0.0, farthest_distance - half_swath_km)

    normalized_max_off_nadir_deg = _normalize_max_off_nadir_deg(max_off_nadir_deg)

    if normalized_max_off_nadir_deg is None:
        if min_shift_km > 0:
           _max_off_nadir_deg(max_off_nadir_deg)

    if normalized_max_off_nadir_deg is None:
        if min_shift_km > 0:
            return None, None

        return 0.0, 0.0

    max_allowed_shift_km = _calculate_max_side_shift_km(
        altitude_km=altitude_km,
        max_off_nadir_deg=normalized_max_off_nadir_deg,
    )

    if min_shift_km > max_allowed_shift_km:
        return None, None

    max_shift_km = min(max_required_shift_km, max_allowed_shift_km)

    if max_shift_km < min_shift_km:
        max_shift_km = min_shift_km

    min_angle_deg = degrees(atan(min_shift_km / altitude_km))
    max_angle_deg = degrees(atan(max_shift_km / altitude_km))

    return round(min_angle_deg, 2), round(max_angle_deg, 2)

def _iter_projected_geometry_coordinates(geometry):
    if geometry.is_empty:
        return

    if geometry.geom_type == "Point":
        yield geometry.x, geometry.y
        return

    if geometry.geom_type in {"LineString", "LinearRing"}:
        yield from geometry.coords
        return

    if geometry.geom_type == "Polygon":
        yield from geometry.exterior.coords

        for interior in geometry.interiors:
            yield from interior.coords

        return

    if hasattr(geometry, "geoms"):
        for item in geometry.geoms:
            yield from _iter_projected_geometry_coordinates(item)


def _calculate_aoi_distance_range_km(
    projected_point: Point,
    projected_aoi,
) -> tuple[float, float]:
    nearest_distance_km = projected_point.distance(projected_aoi) / 1000.0

    farthest_distance_m: float | None = None

    for x, y in _iter_projected_geometry_coordinates(projected_aoi):
        distance_m = projected_point.distance(Point(x, y))

        if farthest_distance_m is None or distance_m > farthest_distance_m:
            farthest_distance_m = distance_m

    if farthest_distance_m is None:
        farthest_distance_m = projected_point.distance(projected_aoi.centroid)

    farthest_distance_km = farthest_distance_m / 1000.0

    if farthest_distance_km < nearest_distance_km:
        farthest_distance_km = nearest_distance_km

    return nearest_distance_km, farthest_distance_km


def _calculate_required_off_nadir_deg(
    nearest_distance_km: float,
    farthest_distance_km: float,
    altitude_km: float,
    half_swath_km: float,
) -> float | None:
    """
    Считает минимальный угол наведения не для касания AOI одним краем,
    а для полезного положения полосы относительно AOI.

    Логика:
    1. Если штатная полоса уже накрывает AOI целиком — угол 0.
    2. Если полоса шире AOI — нужен минимальный сдвиг, чтобы AOI целиком попал в полосу.
    3. Если AOI шире полосы — нужен минимальный сдвиг, чтобы полоса целиком вошла в AOI.
    """
    if altitude_km <= 0:
        return None

    if half_swath_km <= 0:
        return None

    nearest_distance = max(0.0, nearest_distance_km)
    farthest_distance = max(nearest_distance, farthest_distance_km)

    if farthest_distance <= half_swath_km:
        return 0.0

    aoi_radial_depth_km = farthest_distance - nearest_distance
    full_swath_km = half_swath_km * 2.0

    if full_swath_km >= aoi_radial_depth_km:
        required_side_shift_km = max(0.0, farthest_distance - half_swath_km)
    else:
        required_side_shift_km = nearest_distance + half_swath_km

    required_off_nadir_deg = degrees(atan(required_side_shift_km / altitude_km))

    return round(required_off_nadir_deg, 2)


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


def _build_detected_observation_window(
    *,
    aoi_geojson: dict[str, Any],
    access_start: datetime,
    access_end: datetime,
    current_elevation_values: list[float],
    current_off_nadir_values: list[float],
    current_scores: list[float],
    current_required_off_nadir_values: list[float],
    current_required_off_nadir_max_values: list[float] | None = None,
    max_off_nadir_deg: float | None,
    sar_min_look_angle_deg: float | None = None,
    sar_max_look_angle_deg: float | None = None,
    sar_look_direction: str | None = None,
) -> DetectedObservationWindow:
    duration_sec = int((access_end - access_start).total_seconds())

    solar_illumination = calculate_window_solar_illumination(
        aoi_geojson=aoi_geojson,
        access_start=access_start,
        access_end=access_end,
    )

    required_off_nadir_deg = (
        min(current_required_off_nadir_values)
        if current_required_off_nadir_values
        else None
    )

    required_off_nadir_max_deg = (
        max(current_required_off_nadir_max_values)
        if current_required_off_nadir_max_values
        else required_off_nadir_deg
    )

    requires_pointing = (
        max_off_nadir_deg is not None
        and required_off_nadir_max_deg is not None
        and required_off_nadir_max_deg > 0
    )

    return DetectedObservationWindow(
        access_start=access_start,
        access_end=access_end,
        duration_sec=duration_sec,
        max_elevation_deg=max(current_elevation_values)
        if current_elevation_values
        else None,
        off_nadir_deg=min(current_off_nadir_values)
        if current_off_nadir_values
        else None,
        observation_score=max(current_scores) if current_scores else None,
        sun_elevation_deg=solar_illumination.sun_elevation_deg,
        is_daylight=solar_illumination.is_daylight,
        max_off_nadir_deg=max_off_nadir_deg,
        required_off_nadir_deg=required_off_nadir_deg,
        required_off_nadir_max_deg=required_off_nadir_max_deg,
        requires_pointing=requires_pointing,
        sar_min_look_angle_deg=sar_min_look_angle_deg,
        sar_max_look_angle_deg=sar_max_look_angle_deg,
        sar_look_direction=sar_look_direction,
    )


def detect_observation_windows(
    track_points: list[dict[str, Any]],
    aoi_geojson: dict[str, Any],
    swath_km: float | None,
    step_seconds: int,
    max_off_nadir_deg: float | None = None,
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

    normalized_max_off_nadir_deg = _normalize_max_off_nadir_deg(max_off_nadir_deg)

    projected_aoi, transformer = _project_geometry_to_local_meters(aoi_geojson)

    half_swath_m = (swath_km_float * 1000.0) / 2.0
    half_swath_km = swath_km_float / 2.0

    visible_points: list[dict[str, Any]] = []

    for point in track_points:
        longitude = point["longitude"]
        latitude = point["latitude"]

        x, y = transformer.transform(longitude, latitude)
        projected_point = Point(x, y)

        distance_km, farthest_distance_km = _calculate_aoi_distance_range_km(
            projected_point=projected_point,
            projected_aoi=projected_aoi,
        )
        altitude_km = float(point.get("altitude_km") or 0)

        max_side_shift_km = _calculate_max_side_shift_km(
            altitude_km=altitude_km,
            max_off_nadir_deg=normalized_max_off_nadir_deg,
        )

        reachable_distance_km = half_swath_km + max_side_shift_km

        if distance_km <= reachable_distance_km:
            max_elevation_deg, off_nadir_deg, score = _calculate_metrics(
                distance_km=distance_km,
                altitude_km=altitude_km,
                half_swath_km=half_swath_km,
            )

            required_off_nadir_deg, required_off_nadir_max_deg = (
                _calculate_required_off_nadir_range_deg(
                    nearest_distance_km=distance_km,
                    farthest_distance_km=farthest_distance_km,
                    altitude_km=altitude_km,
                    half_swath_km=half_swath_km,
                    max_off_nadir_deg=normalized_max_off_nadir_deg,
                )
            )

            visible_points.append(
                {
                    "time": _parse_datetime(point["time_utc"]),
                    "distance_km": distance_km,
                    "max_elevation_deg": max_elevation_deg,
                    "off_nadir_deg": off_nadir_deg,
                    "observation_score": score,
                    "required_off_nadir_deg": required_off_nadir_deg,
                    "required_off_nadir_max_deg": required_off_nadir_max_deg,
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
    current_required_off_nadir_values: list[float] = []
    current_required_off_nadir_max_values: list[float] = []

    def add_metrics(point: dict[str, Any]):
        if point["observation_score"] is not None:
            current_scores.append(point["observation_score"])
        if point["off_nadir_deg"] is not None:
            current_off_nadir_values.append(point["off_nadir_deg"])
        if point["max_elevation_deg"] is not None:
            current_elevation_values.append(point["max_elevation_deg"])
        if point["required_off_nadir_deg"] is not None:
            current_required_off_nadir_values.append(point["required_off_nadir_deg"])
        if point.get("required_off_nadir_max_deg") is not None:
            current_required_off_nadir_max_values.append(
                point["required_off_nadir_max_deg"]
            )

    add_metrics(visible_points[0])

    for point in visible_points[1:]:
        point_time = point["time"]
        gap_seconds = (point_time - current_end).total_seconds()

        if gap_seconds <= step_seconds * 1.5:
            current_end = point_time + timedelta(seconds=step_seconds)
            add_metrics(point)
        else:
            windows.append(
                _build_detected_observation_window(
                    aoi_geojson=aoi_geojson,
                    access_start=current_start,
                    access_end=current_end,
                    current_elevation_values=current_elevation_values,
                    current_off_nadir_values=current_off_nadir_values,
                    current_scores=current_scores,
                    current_required_off_nadir_values=current_required_off_nadir_values,
                    current_required_off_nadir_max_values=current_required_off_nadir_max_values,
                    max_off_nadir_deg=normalized_max_off_nadir_deg,
                )
            )

            current_start = point_time
            current_end = point_time + timedelta(seconds=step_seconds)
            current_scores = []
            current_off_nadir_values = []
            current_elevation_values = []
            current_required_off_nadir_values = []
            current_required_off_nadir_max_values = []
            add_metrics(point)

    windows.append(
        _build_detected_observation_window(
            aoi_geojson=aoi_geojson,
            access_start=current_start,
            access_end=current_end,
            current_elevation_values=current_elevation_values,
            current_off_nadir_values=current_off_nadir_values,
            current_scores=current_scores,
            current_required_off_nadir_values=current_required_off_nadir_values,
            current_required_off_nadir_max_values=current_required_off_nadir_max_values,
            max_off_nadir_deg=normalized_max_off_nadir_deg,
        )
    )

    return windows



def _normalize_sar_look_direction(value: str | None) -> str:
    if value in {"left", "right", "both"}:
        return value

    return "both"


def _calculate_ground_range_km(
    altitude_km: float,
    look_angle_deg: float | None,
) -> float | None:
    if altitude_km <= 0:
        return None

    if look_angle_deg is None:
        return None

    look_angle_float = float(look_angle_deg)

    if look_angle_float <= 0 or look_angle_float >= 90:
        return None

    return altitude_km * tan(radians(look_angle_float))


def _calculate_off_nadir_to_aoi_centroid_deg(
    projected_point: Point,
    projected_aoi,
    altitude_km: float,
) -> float | None:
    if altitude_km <= 0:
        return None

    centroid_distance_km = projected_point.distance(projected_aoi.centroid) / 1000.0

    return round(degrees(atan(centroid_distance_km / altitude_km)), 2)


def _get_local_track_direction(
    local_track_points: list[dict[str, Any]],
    point_index: int,
) -> tuple[float, float] | None:
    if len(local_track_points) < 2:
        return None

    if point_index == 0:
        previous_point = local_track_points[point_index]
        next_point = local_track_points[point_index + 1]
    elif point_index == len(local_track_points) - 1:
        previous_point = local_track_points[point_index - 1]
        next_point = local_track_points[point_index]
    else:
        previous_point = local_track_points[point_index - 1]
        next_point = local_track_points[point_index + 1]

    dx = next_point["x"] - previous_point["x"]
    dy = next_point["y"] - previous_point["y"]

    if dx == 0 and dy == 0:
        return None

    return dx, dy


def _is_aoi_on_requested_sar_side(
    *,
    projected_point: Point,
    projected_aoi,
    direction_vector: tuple[float, float] | None,
    sar_look_direction: str,
) -> bool:
    if sar_look_direction == "both":
        return True

    if direction_vector is None:
        return True

    dx, dy = direction_vector
    vector_to_aoi_x = projected_aoi.centroid.x - projected_point.x
    vector_to_aoi_y = projected_aoi.centroid.y - projected_point.y

    cross_product = dx * vector_to_aoi_y - dy * vector_to_aoi_x

    if sar_look_direction == "left":
        return cross_product > 0

    if sar_look_direction == "right":
        return cross_product < 0

    return True


def _build_detected_sar_observation_window(
    *,
    aoi_geojson: dict[str, Any],
    access_start: datetime,
    access_end: datetime,
    current_elevation_values: list[float],
    current_off_nadir_values: list[float],
    current_scores: list[float],
    current_required_off_nadir_values: list[float],
    sar_min_look_angle_deg: float,
    sar_max_look_angle_deg: float,
    sar_look_direction: str,
) -> DetectedObservationWindow:
    window = _build_detected_observation_window(
        aoi_geojson=aoi_geojson,
        access_start=access_start,
        access_end=access_end,
        current_elevation_values=current_elevation_values,
        current_off_nadir_values=current_off_nadir_values,
        current_scores=current_scores,
        current_required_off_nadir_values=current_required_off_nadir_values,
        max_off_nadir_deg=None,
        sar_min_look_angle_deg=sar_min_look_angle_deg,
        sar_max_look_angle_deg=sar_max_look_angle_deg,
        sar_look_direction=sar_look_direction,
    )

    window.requires_pointing = True

    return window


def detect_sar_observation_windows(
    track_points: list[dict[str, Any]],
    aoi_geojson: dict[str, Any],
    step_seconds: int,
    sar_min_look_angle_deg: float | None,
    sar_max_look_angle_deg: float | None,
    sar_look_direction: str | None = "both",
) -> list[DetectedObservationWindow]:
    if not track_points:
        return []

    if sar_min_look_angle_deg is None or sar_max_look_angle_deg is None:
        return []

    sar_min_look_angle_float = float(sar_min_look_angle_deg)
    sar_max_look_angle_float = float(sar_max_look_angle_deg)

    if sar_min_look_angle_float <= 0:
        return []

    if sar_max_look_angle_float <= sar_min_look_angle_float:
        return []

    if sar_max_look_angle_float >= 90:
        return []

    if step_seconds <= 0:
        raise ValueError("step_seconds must be greater than 0")

    normalized_sar_look_direction = _normalize_sar_look_direction(sar_look_direction)

    projected_aoi, transformer = _project_geometry_to_local_meters(aoi_geojson)

    local_track_points: list[dict[str, Any]] = []

    for point in track_points:
        longitude = point["longitude"]
        latitude = point["latitude"]
        x, y = transformer.transform(longitude, latitude)

        local_track_points.append(
            {
                "source": point,
                "x": x,
                "y": y,
                "point": Point(x, y),
            }
        )

    visible_points: list[dict[str, Any]] = []

    for point_index, local_point in enumerate(local_track_points):
        source_point = local_point["source"]
        projected_point = local_point["point"]
        altitude_km = float(source_point.get("altitude_km") or 0)

        near_range_km = _calculate_ground_range_km(
            altitude_km=altitude_km,
            look_angle_deg=sar_min_look_angle_float,
        )
        far_range_km = _calculate_ground_range_km(
            altitude_km=altitude_km,
            look_angle_deg=sar_max_look_angle_float,
        )

        if near_range_km is None or far_range_km is None:
            continue

        near_range_m = near_range_km * 1000.0
        far_range_m = far_range_km * 1000.0

        if far_range_m <= near_range_m:
            continue

        direction_vector = _get_local_track_direction(
            local_track_points=local_track_points,
            point_index=point_index,
        )

        if not _is_aoi_on_requested_sar_side(
            projected_point=projected_point,
            projected_aoi=projected_aoi,
            direction_vector=direction_vector,
            sar_look_direction=normalized_sar_look_direction,
        ):
            continue

        sar_reachable_zone = projected_point.buffer(far_range_m).difference(
            projected_point.buffer(near_range_m)
        )

        if sar_reachable_zone.is_empty:
            continue

        if not sar_reachable_zone.intersects(projected_aoi):
            continue

        off_nadir_deg = _calculate_off_nadir_to_aoi_centroid_deg(
            projected_point=projected_point,
            projected_aoi=projected_aoi,
            altitude_km=altitude_km,
        )

        if off_nadir_deg is None:
            continue

        max_elevation_deg = round(max(0.0, 90.0 - off_nadir_deg), 2)

        visible_points.append(
            {
                "time": _parse_datetime(source_point["time_utc"]),
                "max_elevation_deg": max_elevation_deg,
                "off_nadir_deg": off_nadir_deg,
                "observation_score": 1.0,
                "required_off_nadir_deg": off_nadir_deg,
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
    current_required_off_nadir_values: list[float] = []

    def add_metrics(point: dict[str, Any]):
        if point["observation_score"] is not None:
            current_scores.append(point["observation_score"])
        if point["off_nadir_deg"] is not None:
            current_off_nadir_values.append(point["off_nadir_deg"])
        if point["max_elevation_deg"] is not None:
            current_elevation_values.append(point["max_elevation_deg"])
        if point["required_off_nadir_deg"] is not None:
            current_required_off_nadir_values.append(point["required_off_nadir_deg"])

    add_metrics(visible_points[0])

    for point in visible_points[1:]:
        point_time = point["time"]
        gap_seconds = (point_time - current_end).total_seconds()

        if gap_seconds <= step_seconds * 1.5:
            current_end = point_time + timedelta(seconds=step_seconds)
            add_metrics(point)
        else:
            windows.append(
                _build_detected_sar_observation_window(
                    aoi_geojson=aoi_geojson,
                    access_start=current_start,
                    access_end=current_end,
                    current_elevation_values=current_elevation_values,
                    current_off_nadir_values=current_off_nadir_values,
                    current_scores=current_scores,
                    current_required_off_nadir_values=current_required_off_nadir_values,
                    sar_min_look_angle_deg=sar_min_look_angle_float,
                    sar_max_look_angle_deg=sar_max_look_angle_float,
                    sar_look_direction=normalized_sar_look_direction,
                )
            )

            current_start = point_time
            current_end = point_time + timedelta(seconds=step_seconds)
            current_scores = []
            current_off_nadir_values = []
            current_elevation_values = []
            current_required_off_nadir_values = []
            add_metrics(point)

    windows.append(
        _build_detected_sar_observation_window(
            aoi_geojson=aoi_geojson,
            access_start=current_start,
            access_end=current_end,
            current_elevation_values=current_elevation_values,
            current_off_nadir_values=current_off_nadir_values,
            current_scores=current_scores,
            current_required_off_nadir_values=current_required_off_nadir_values,
            sar_min_look_angle_deg=sar_min_look_angle_float,
            sar_max_look_angle_deg=sar_max_look_angle_float,
            sar_look_direction=normalized_sar_look_direction,
        )
    )

    return windows


def calculate_sar_reachable_coverage_percent(
    track_points: list[dict[str, Any]],
    aoi_geojson: dict[str, Any],
    sar_min_look_angle_deg: float | None,
    sar_max_look_angle_deg: float | None,
    access_start: datetime,
    access_end: datetime,
) -> float | None:
    if sar_min_look_angle_deg is None or sar_max_look_angle_deg is None:
        return None

    projected_aoi, transformer = _project_geometry_to_local_meters(aoi_geojson)

    if projected_aoi.area <= 0:
        return None

    local_coordinates, altitude_values_km = _collect_window_local_coordinates(
        track_points=track_points,
        transformer=transformer,
        access_start=access_start,
        access_end=access_end,
    )

    if len(local_coordinates) < 2 or not altitude_values_km:
        return None

    average_altitude_km = sum(altitude_values_km) / len(altitude_values_km)

    near_range_km = _calculate_ground_range_km(
        altitude_km=average_altitude_km,
        look_angle_deg=sar_min_look_angle_deg,
    )
    far_range_km = _calculate_ground_range_km(
        altitude_km=average_altitude_km,
        look_angle_deg=sar_max_look_angle_deg,
    )

    if near_range_km is None or far_range_km is None:
        return None

    if far_range_km <= near_range_km:
        return None

    line = LineString(local_coordinates)
    sar_zone = line.buffer(
        far_range_km * 1000.0,
        cap_style=2,
        join_style=2,
    ).difference(
        line.buffer(
            near_range_km * 1000.0,
            cap_style=2,
            join_style=2,
        )
    )

    if sar_zone.is_empty:
        return None

    intersection = sar_zone.intersection(projected_aoi)

    if intersection.is_empty:
        return 0.0

    coverage = (intersection.area / projected_aoi.area) * 100.0
    coverage = max(0.0, min(100.0, coverage))

    return round(coverage, 2)

def _to_naive_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value

    return value.astimezone(timezone.utc).replace(tzinfo=None)


def _collect_window_local_coordinates(
    *,
    track_points: list[dict[str, Any]],
    transformer: Transformer,
    access_start: datetime,
    access_end: datetime,
) -> tuple[list[tuple[float, float]], list[float]]:
    start_time = _to_naive_utc(access_start)
    end_time = _to_naive_utc(access_end)

    local_coordinates: list[tuple[float, float]] = []
    altitude_values_km: list[float] = []

    for point in track_points:
        point_time = _to_naive_utc(_parse_datetime(point["time_utc"]))

        if point_time < start_time or point_time > end_time:
            continue

        longitude = point["longitude"]
        latitude = point["latitude"]

        x, y = transformer.transform(longitude, latitude)
        local_coordinates.append((x, y))

        altitude_km = point.get("altitude_km")

        if altitude_km is not None:
            altitude_values_km.append(float(altitude_km))

    return local_coordinates, altitude_values_km


def _calculate_corridor_coverage_percent(
    *,
    track_points: list[dict[str, Any]],
    aoi_geojson: dict[str, Any],
    access_start: datetime,
    access_end: datetime,
    half_width_m: float,
) -> float | None:
    if not track_points:
        return None

    if half_width_m <= 0:
        return None

    projected_aoi, transformer = _project_geometry_to_local_meters(aoi_geojson)

    if projected_aoi.area <= 0:
        return None

    local_coordinates, _altitude_values_km = _collect_window_local_coordinates(
        track_points=track_points,
        transformer=transformer,
        access_start=access_start,
        access_end=access_end,
    )

    if len(local_coordinates) < 2:
        return None

    line = LineString(local_coordinates)

    corridor = line.buffer(
        half_width_m,
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


def calculate_coverage_percent(
    track_points: list[dict[str, Any]],
    aoi_geojson: dict[str, Any],
    swath_km: float | None,
    access_start: datetime,
    access_end: datetime,
) -> float | None:
    if swath_km is None:
        return None

    swath_km_float = float(swath_km)

    if swath_km_float <= 0:
        return None

    half_swath_m = (swath_km_float * 1000.0) / 2.0

    return _calculate_corridor_coverage_percent(
        track_points=track_points,
        aoi_geojson=aoi_geojson,
        access_start=access_start,
        access_end=access_end,
        half_width_m=half_swath_m,
    )


def calculate_reachable_coverage_percent(
    track_points: list[dict[str, Any]],
    aoi_geojson: dict[str, Any],
    swath_km: float | None,
    max_off_nadir_deg: float | None,
    access_start: datetime,
    access_end: datetime,
) -> float | None:
    if swath_km is None:
        return None

    swath_km_float = float(swath_km)

    if swath_km_float <= 0:
        return None

    normalized_max_off_nadir_deg = _normalize_max_off_nadir_deg(max_off_nadir_deg)

    if normalized_max_off_nadir_deg is None:
        return calculate_coverage_percent(
            track_points=track_points,
            aoi_geojson=aoi_geojson,
            swath_km=swath_km,
            access_start=access_start,
            access_end=access_end,
        )

    projected_aoi, transformer = _project_geometry_to_local_meters(aoi_geojson)

    if projected_aoi.area <= 0:
        return None

    _local_coordinates, altitude_values_km = _collect_window_local_coordinates(
        track_points=track_points,
        transformer=transformer,
        access_start=access_start,
        access_end=access_end,
    )

    if not altitude_values_km:
        return calculate_coverage_percent(
            track_points=track_points,
            aoi_geojson=aoi_geojson,
            swath_km=swath_km,
            access_start=access_start,
            access_end=access_end,
        )

    average_altitude_km = sum(altitude_values_km) / len(altitude_values_km)

    max_side_shift_km = _calculate_max_side_shift_km(
        altitude_km=average_altitude_km,
        max_off_nadir_deg=normalized_max_off_nadir_deg,
    )

    half_swath_m = (swath_km_float * 1000.0) / 2.0
    reachable_half_width_m = half_swath_m + max_side_shift_km * 1000.0

    return _calculate_corridor_coverage_percent(
        track_points=track_points,
        aoi_geojson=aoi_geojson,
        access_start=access_start,
        access_end=access_end,
        half_width_m=reachable_half_width_m,
    )