from pydantic import BaseModel


class SensorBandRead(BaseModel):
    id: int
    band_name: str
    min_wavelength_nm: float | None = None
    max_wavelength_nm: float | None = None

    model_config = {"from_attributes": True}


class SensorRead(BaseModel):
    id: int
    satellite_id: int
    name: str
    swath_km: float | None = None
    resolution_m: float | None = None
    bands: list[SensorBandRead] = []

    model_config = {"from_attributes": True}


class SatelliteRead(BaseModel):
    id: int
    name: str
    norad_id: int
    is_active: bool

    model_config = {"from_attributes": True}
