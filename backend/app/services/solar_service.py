from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from shapely.geometry import shape


DAYLIGHT_SUN_ELEVATION_MIN_DEG = 5.0


@dataclass(frozen=True)
class SolarIllumination:
    sun_elevation_deg: float
    is_daylight: bool


def calculate_window_solar_illumination(
    aoi_geojson: dict[str, Any],
    access_start: datetime,
    access_end: datetime,
) -> SolarIllumination:
    """
    Рассчитывает освещённость для окна наблюдения.

    Вариант 1:
    - точка расчёта: центроид AOI;
    - время расчёта: середина окна наблюдения.
    """

    aoi_geometry = shape(aoi_geojson)
    centroid = aoi_geometry.centroid

    longitude = float(centroid.x)
    latitude = float(centroid.y)

    midpoint = access_start + (access_end - access_start) / 2

    sun_elevation_deg = calculate_sun_elevation_deg(
        latitude=latitude,
        longitude=longitude,
        moment=midpoint,
    )

    return SolarIllumination(
        sun_elevation_deg=round(sun_elevation_deg, 3),
        is_daylight=sun_elevation_deg >= DAYLIGHT_SUN_ELEVATION_MIN_DEG,
    )


def calculate_sun_elevation_deg(
    latitude: float,
    longitude: float,
    moment: datetime,
) -> float:
    """
    Приближённый расчёт высоты Солнца над горизонтом.

    latitude / longitude — WGS-84, градусы.
    moment — UTC-время.
    """

    moment_utc = _to_utc(moment)

    day_of_year = moment_utc.timetuple().tm_yday

    decimal_hour = (
        moment_utc.hour
        + moment_utc.minute / 60.0
        + moment_utc.second / 3600.0
        + moment_utc.microsecond / 3_600_000_000.0
    )

    gamma = 2.0 * math.pi / 365.0 * (day_of_year - 1 + (decimal_hour - 12.0) / 24.0)

    equation_of_time_min = 229.18 * (
        0.000075
        + 0.001868 * math.cos(gamma)
        - 0.032077 * math.sin(gamma)
        - 0.014615 * math.cos(2.0 * gamma)
        - 0.040849 * math.sin(2.0 * gamma)
    )

    solar_declination_rad = (
        0.006918
        - 0.399912 * math.cos(gamma)
        + 0.070257 * math.sin(gamma)
        - 0.006758 * math.cos(2.0 * gamma)
        + 0.000907 * math.sin(2.0 * gamma)
        - 0.002697 * math.cos(3.0 * gamma)
        + 0.00148 * math.sin(3.0 * gamma)
    )

    time_offset_min = equation_of_time_min + 4.0 * longitude

    true_solar_time_min = (
        decimal_hour * 60.0 + time_offset_min
    ) % 1440.0

    hour_angle_deg = true_solar_time_min / 4.0 - 180.0

    latitude_rad = math.radians(latitude)
    hour_angle_rad = math.radians(hour_angle_deg)

    cos_zenith = (
        math.sin(latitude_rad) * math.sin(solar_declination_rad)
        + math.cos(latitude_rad)
        * math.cos(solar_declination_rad)
        * math.cos(hour_angle_rad)
    )

    cos_zenith = max(-1.0, min(1.0, cos_zenith))

    zenith_deg = math.degrees(math.acos(cos_zenith))
    return 90.0 - zenith_deg


def is_daylight_required_for_sensor(sensor_type: str | None) -> bool:
    """
    Возвращает True, если сенсор зависит от дневного солнечного освещения.
    """

    normalized = (sensor_type or "").lower().strip()

    if (
        "sar" in normalized
        or "radar" in normalized
        or "радиолока" in normalized
        or "thermal" in normalized
        or "tir" in normalized
        or "теплов" in normalized
    ):
        return False

    if (
        "optical" in normalized
        or "multispectral" in normalized
        or "panchromatic" in normalized
        or "visible" in normalized
        or "оптичес" in normalized
    ):
        return True

    return False


def _to_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)

    return value.astimezone(timezone.utc)
