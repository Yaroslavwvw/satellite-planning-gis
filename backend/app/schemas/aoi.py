from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class AOICreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    geometry: dict


class AOIRead(BaseModel):
    aoi_id: int
    name: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)