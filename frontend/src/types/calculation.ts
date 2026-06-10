export type CalculationRequest = {
  aoi_id: number
  period_start: string
  period_end: string
  step_seconds: number
  mode: 'all_catalog' | 'selected'
  satellite_ids: number[]
}

export type CalculationRun = {
  calculation_run_id: number
  aoi_id: number
  period_start: string
  period_end: string
  step_seconds: number
  mode: string
  status: string
  created_at: string
}

export type ObservationWindow = {
  window_id: number
  calculation_run_id: number
  satellite_id: number
  satellite_name: string
  sensor_id: number
  sensor_name: string
  sensor_mode_id: number | null
  sensor_mode_name: string | null
  aoi_id: number
  access_start: string
  access_end: string
  duration_sec: number
  max_elevation_deg: number | null
  off_nadir_deg: number | null
  observation_score: number | null
  coverage_percent: number | null
  sun_elevation_deg: number | null
  is_daylight: boolean | null
  daylight_required: boolean
  swath_km: number | null
  max_off_nadir_deg: number | null
  required_off_nadir_deg: number | null
  requires_pointing: boolean
  reachable_coverage_percent: number | null
}

export type CalculationResultResponse = {
  calculation_run: CalculationRun
  aoi: CalculationAoi
  satellite_ids: number[]
  windows: ObservationWindow[]
  tracks: TrackLayer[]
  footprints: FootprintLayer[]
}

export type CalculationPlaceholderResponse = {
  calculation_run: CalculationRun
  placeholder: {
    status: string
    summary: string
    result_url?: string
    satellites_used?: string[]
  }
}

export type CalculationAoi = {
  aoi_id: number
  name: string
  geometry: {
    type: 'Polygon'
    coordinates: number[][][]
  }
}

export type GeoJsonLineString = {
  type: 'LineString'
  coordinates: number[][]
}

export type GeoJsonPolygon = {
  type: 'Polygon'
  coordinates: number[][][]
}

export type GeoJsonMultiPolygon = {
  type: 'MultiPolygon'
  coordinates: number[][][][]
}

export type TrackLayer = {
  satellite_id: number
  satellite_name: string
  geometry: GeoJsonLineString
}

export type FootprintLayer = {
  satellite_id: number
  satellite_name: string
  sensor_id: number
  sensor_name: string
  swath_km: number | null
  geometry: GeoJsonPolygon | GeoJsonMultiPolygon
}

export type WindowMapLayerResponse = {
  window_id: number
  calculation_run_id: number
  track: TrackLayer | null
  footprint: FootprintLayer | null
  reachable_footprint: FootprintLayer | null

  saved_coverage_percent?: number | null
  computed_coverage_percent?: number | null
  aoi_area_km2?: number | null
  footprint_area_km2?: number | null
  intersection_area_km2?: number | null
}