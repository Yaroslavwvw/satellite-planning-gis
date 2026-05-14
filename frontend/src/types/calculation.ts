export interface CalculationRequest {
  aoi_id: number
  period_start: string
  period_end: string
  satellite_ids: number[]
}

export interface CalculationRun {
  id: number
  aoi_id: number
  period_start: string
  period_end: string
  status: string
  created_at: string
  result_payload?: Record<string, unknown>
}
