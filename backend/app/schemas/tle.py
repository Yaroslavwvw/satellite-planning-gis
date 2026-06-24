from datetime import datetime

from pydantic import BaseModel, Field


class TLEUpdateRequest(BaseModel):
    satellite_ids: list[int] | None = Field(default=None)


class TLEStatusResponse(BaseModel):
    source_name: str = "CelesTrak"

    last_updated_at: datetime | None = None
    next_update_at: datetime | None = None

    is_stale: bool
    is_updating: bool

    current_records: int
    total_satellites: int


class TLEUpdateResponse(TLEStatusResponse):
    updated_records: int = 0
    details: list[str] = Field(default_factory=list)