from pydantic import BaseModel, ConfigDict


class SensorBandRead(BaseModel):
    band_id: int
    sensor_id: int
    # band_name: str
    spectral_range_nm: str | None = None
    spatial_resolution_m: float

    band_code: str | None = None
    band_name: str | None = None
    wavelength_min_nm: float | None = None
    wavelength_max_nm: float | None = None
    band_type: str | None = None
    is_grouped: bool = False

    model_config = ConfigDict(from_attributes=True)


class SensorRead(BaseModel):
    sensor_id: int
    satellite_id: int
    name: str
    sensor_type: str
    swath_km: float | None = None
    off_nadir_max_deg: float | None = None
    retarget_time_sec: int | None = None
    notes: str | None = None
    bands: list[SensorBandRead] = []

    model_config = ConfigDict(from_attributes=True)


class SatelliteRead(BaseModel):
    satellite_id: int
    name: str
    norad_id: int
    object_id: str | None = None
    country: str | None = None
    mission_type: str
    orbit_type: str | None = None
    inclination_deg: float | None = None
    orbital_period_min: float | None = None
    avg_altitude_km: float | None = None
    description: str | None = None

    model_config = ConfigDict(from_attributes=True)