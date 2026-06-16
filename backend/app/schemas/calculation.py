from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class CalculationCreate(BaseModel):
    aoi_id: int
    period_start: datetime
    period_end: datetime

    off_nadir_enabled: bool = False
    manual_off_nadir_deg: float | None = Field(default=None, ge=0, lt=90)
    sar_look_direction: str = "both"

    step_seconds: int = Field(default=60, gt=0)
    mode: str = Field(default="all_catalog")
    satellite_ids: list[int] = Field(default_factory=list)

    @field_validator("mode")
    @classmethod
    def validate_mode(cls, mode: str):
        if mode not in {"all_catalog", "selected"}:
            raise ValueError("mode must be 'all_catalog' or 'selected'")
        return mode

    @field_validator("sar_look_direction")
    @classmethod
    def validate_sar_look_direction(cls, sar_look_direction: str):
        if sar_look_direction not in {"left", "right", "both"}:
            raise ValueError("sar_look_direction must be 'left', 'right' or 'both'")
        return sar_look_direction

    @field_validator("manual_off_nadir_deg")
    @classmethod
    def validate_manual_off_nadir_deg(cls, manual_off_nadir_deg: float | None, info):
        off_nadir_enabled = info.data.get("off_nadir_enabled")

        if off_nadir_enabled and manual_off_nadir_deg is None:
            raise ValueError("manual_off_nadir_deg is required when off_nadir_enabled is true")

        return manual_off_nadir_deg

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

    off_nadir_enabled: bool = False
    manual_off_nadir_deg: float | None = None
    sar_look_direction: str = "both"

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
    sensor_mode_id: int | None = None
    sensor_mode_name: str | None = None
    aoi_id: int
    access_start: datetime
    access_end: datetime
    duration_sec: int
    max_elevation_deg: float | None = None
    off_nadir_deg: float | None = None
    observation_score: float | None = None
    coverage_percent: float | None = None
    sun_elevation_deg: float | None = None
    is_daylight: bool | None = None
    daylight_required: bool = False
    swath_km: float | None = None
    max_off_nadir_deg: float | None = None
    required_off_nadir_deg: float | None = None
    required_off_nadir_max_deg: float | None = None
    requires_pointing: bool = False
    reachable_coverage_percent: float | None = None

    sar_min_look_angle_deg: float | None = None
    sar_max_look_angle_deg: float | None = None
    sar_look_direction: str | None = None


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
    reachable_footprint: FootprintLayerRead | None = None

    saved_coverage_percent: float | None = None
    computed_coverage_percent: float | None = None
    aoi_area_km2: float | None = None
    footprint_area_km2: float | None = None
    intersection_area_km2: float | None = None


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

