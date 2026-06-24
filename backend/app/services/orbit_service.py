from datetime import datetime, timedelta, timezone
from typing import Any

from skyfield.api import EarthSatellite, load, wgs84


def ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def generate_time_points(
    start_time: datetime,
    end_time: datetime,
    step_seconds: int,
) -> list[datetime]:
    start_time = ensure_utc(start_time)
    end_time = ensure_utc(end_time)

    points: list[datetime] = []
    current_time = start_time

    while current_time <= end_time:
        points.append(current_time)
        current_time += timedelta(seconds=step_seconds)

    return points


def generate_satellite_track(
    satellite_name: str,
    line1: str,
    line2: str,
    start_time: datetime,
    end_time: datetime,
    step_seconds: int,
) -> list[dict[str, Any]]:
    if step_seconds <= 0:
        raise ValueError("step_seconds must be greater than 0")

    if end_time <= start_time:
        raise ValueError("end_time must be greater than start_time")

    timescale = load.timescale()
    satellite = EarthSatellite(line1, line2, satellite_name, timescale)

    track_points: list[dict[str, Any]] = []

    for current_time in generate_time_points(start_time, end_time, step_seconds):
        skyfield_time = timescale.from_datetime(current_time)

        geocentric = satellite.at(skyfield_time)
        subpoint = wgs84.subpoint(geocentric)

        track_points.append(
            {
                "time_utc": current_time.isoformat(),
                "latitude": round(subpoint.latitude.degrees, 6),
                "longitude": round(subpoint.longitude.degrees, 6),
                "altitude_km": round(subpoint.elevation.km, 3),
            }
        )

    return track_points