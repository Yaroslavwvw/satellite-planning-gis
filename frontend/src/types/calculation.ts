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
  aoi_id: number
  access_start: string
  access_end: string
  duration_sec: number
  max_elevation_deg: number | null
  off_nadir_deg: number | null
  observation_score: number | null
}

export type CalculationResultResponse = {
  calculation_run: CalculationRun
  windows: ObservationWindow[]
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