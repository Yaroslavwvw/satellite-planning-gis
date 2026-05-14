export interface Satellite {
  id: number
  name: string
  norad_id: number
  is_active: boolean
}

export interface Sensor {
  id: number
  satellite_id: number
  name: string
  swath_km?: number
  resolution_m?: number
}
