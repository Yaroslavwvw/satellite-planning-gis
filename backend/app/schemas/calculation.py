from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class CalculationCreate(BaseModel):
    aoi_id: int
    period_start: datetime
    period_end: datetime
    step_seconds: int = Field(default=60, gt=0)
    mode: str = Field(default="all_catalog")
    satellite_ids: list[int] = Field(default_factory=list)

    @field_validator("mode")
    @classmethod
    def validate_mode(cls, mode: str):
        if mode not in {"all_catalog", "selected"}:
            raise ValueError("mode must be 'all_catalog' or 'selected'")
        return mode

    @field_validator("period_end")
    @classmethod
    def validate_period(cls, period_end: datetime, info):
        period_start = info.data.get("period_start")

        if period_start is None:
            return period_end

        if period_end <= period_start:
            raise ValueError("period_end must be greater than period_start")

        if (period_end - period_start).days > 7:
            raise ValueError("calculation period must not exceed 7 days")

        return period_end


class CalculationRead(BaseModel):
    calculation_run_id: int
    aoi_id: int
    period_start: datetime
    period_end: datetime
    step_seconds: int
    mode: str
    status: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class CalculationAoiRead(BaseModel):
    aoi_id: int
    name: str
    geometry: dict


class ObservationWindowRead(BaseModel):
    window_id: int
    calculation_run_id: int
    satellite_id: int
    satellite_name: str
    sensor_id: int
    sensor_name: str
    aoi_id: int
    access_start: datetime
    access_end: datetime
    duration_sec: int
    max_elevation_deg: float | None = None
    off_nadir_deg: float | None = None
    observation_score: float | None = None

class TrackLayerRead(BaseModel):
    satellite_id: int
    satellite_name: str
    geometry: dict


class FootprintLayerRead(BaseModel):
    satellite_id: int
    satellite_name: str
    sensor_id: int
    sensor_name: str
    swath_km: float | None = None
    geometry: dict


class WindowMapLayerResponse(BaseModel):
    window_id: int
    calculation_run_id: int
    track: TrackLayerRead | None = None
    footprint: FootprintLayerRead | None = None


class CalculationResultResponse(BaseModel):
    calculation_run: CalculationRead
    aoi: CalculationAoiRead
    satellite_ids: list[int]
    windows: list[ObservationWindowRead]
    tracks: list[TrackLayerRead] = Field(default_factory=list)
    footprints: list[FootprintLayerRead] = Field(default_factory=list)


class CalculationPlaceholderResponse(BaseModel):
    calculation_run: CalculationRead
    placeholder: dict

