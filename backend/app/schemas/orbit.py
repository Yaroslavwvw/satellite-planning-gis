from datetime import datetime

from pydantic import BaseModel, Field


class TrackPointRead(BaseModel):
    time_utc: str
    latitude: float
    longitude: float
    altitude_km: float


class SatelliteTrackResponse(BaseModel):
    satellite_id: int
    satellite_name: str
    norad_id: int
    start_time: datetime
    end_time: datetime
    step_seconds: int
    points_count: int
    track: list[TrackPointRead]


class SatelliteTrackRequest(BaseModel):
    start_time: datetime
    end_time: datetime
    step_seconds: int = Field(default=60, gt=0)