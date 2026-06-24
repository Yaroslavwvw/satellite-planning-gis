import { apiClient } from './client'

export type TleUpdateRequest = {
  satellite_ids: number[] | null
}

export type TleStatusResponse = {
  source_name: string
  last_updated_at: string | null
  next_update_at: string | null
  is_stale: boolean
  is_updating: boolean
  current_records: number
  total_satellites: number
}

export type TleUpdateResponse = TleStatusResponse & {
  updated_records: number
  details: string[]
}

export async function fetchTleStatus(): Promise<TleStatusResponse> {
  const { data } = await apiClient.get<TleStatusResponse>(
    '/api/tle/status',
  )

  return data
}

export async function ensureCurrentTle(
  payload: TleUpdateRequest = {
    satellite_ids: null,
  },
): Promise<TleUpdateResponse> {
  const { data } = await apiClient.post<TleUpdateResponse>(
    '/api/tle/ensure-current',
    payload,
  )

  return data
}

export async function updateTle(
  payload: TleUpdateRequest = {
    satellite_ids: null,
  },
): Promise<TleUpdateResponse> {
  const { data } = await apiClient.post<TleUpdateResponse>(
    '/api/tle/update',
    payload,
  )

  return data
}