from pydantic import BaseModel, Field


class TLEUpdateRequest(BaseModel):
    satellite_ids: list[int] | None = Field(default=None)


class TLEUpdateResponse(BaseModel):
    updated_records: int
    details: list[str]
