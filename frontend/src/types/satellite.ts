export type Satellite = {
  satellite_id: number
  name: string
  norad_id: number
  object_id: string | null
  country: string | null
  mission_type: string
  orbit_type: string | null
  inclination_deg: number | null
  orbital_period_min: number | null
  avg_altitude_km: number | null
  description: string | null
}

export type SensorBand = {
  band_id: number
  sensor_id: number
  // band_name: string
  spectral_range_nm: string | null
  spatial_resolution_m: number
  band_code: string | null
  band_name: string | null
  wavelength_min_nm: number | null
  wavelength_max_nm: number | null
  band_type: string | null
  is_grouped: boolean
}

export type Sensor = {
  sensor_id: number
  satellite_id: number
  name: string
  sensor_type: string
  swath_km: number | null
  off_nadir_max_deg: number | null
  retarget_time_sec: number | null
  notes: string | null
  bands: SensorBand[]
}