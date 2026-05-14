from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator


class CalculationCreate(BaseModel):
    aoi_id: int
    period_start: date
    period_end: date
    satellite_ids: list[int] = Field(default_factory=list)

    @field_validator("period_end")
    @classmethod
    def validate_period(cls, period_end: date, info):
        period_start = info.data.get("period_start")
        if period_start is None:
            return period_end
        if period_end < period_start:
            raise ValueError("period_end must be greater or equal to period_start")
        if (period_end - period_start).days > 7:
            raise ValueError("calculation period must not exceed 7 days")
        return period_end


class CalculationRead(BaseModel):
    id: int
    aoi_id: int
    period_start: date
    period_end: date
    status: str
    created_at: datetime
    result_payload: dict | None = None

    model_config = {"from_attributes": True}


class CalculationPlaceholderResponse(BaseModel):
    calculation_run: CalculationRead
    placeholder: dict
