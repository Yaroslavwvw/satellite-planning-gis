from pydantic import BaseModel, ConfigDict


class SensorBandRead(BaseModel):
    band_id: int
    sensor_id: int
    band_code: str | None = None
    band_name: str | None = None
    spectral_range_nm: str | None = None
    wavelength_min_nm: float | None = None
    wavelength_max_nm: float | None = None
    spatial_resolution_m: float | None = None
    band_type: str | None = None
    is_grouped: bool = False

    model_config = ConfigDict(from_attributes=True)


class SensorModeRead(BaseModel):
    sensor_mode_id: int
    sensor_id: int
    mode_name: str
    mode_type: str | None = None
    swath_km: float | None = None
    spatial_resolution_m: float | None = None
    max_off_nadir_deg: float | None = None
    is_default: bool = False
    description: str | None = None

    model_config = ConfigDict(from_attributes=True)


class SensorRead(BaseModel):
    sensor_id: int
    satellite_id: int
    name: str
    sensor_type: str | None = None
    swath_km: float | None = None
    spatial_resolution_m: float | None = None
    notes: str | None = None
    bands: list[SensorBandRead] = []
    modes: list[SensorModeRead] = []

    model_config = ConfigDict(from_attributes=True)


class SatelliteRead(BaseModel):
    satellite_id: int
    name: str
    norad_id: int
    object_id: str | None = None
    country: str | None = None
    mission_type: str | None = None
    orbit_type: str | None = None
    inclination_deg: float | None = None
    orbital_period_min: float | None = None
    avg_altitude_km: float | None = None
    description: str | None = None
    data_access_type: str | None = None
    data_access_note: str | None = None

    model_config = ConfigDict(from_attributes=True)