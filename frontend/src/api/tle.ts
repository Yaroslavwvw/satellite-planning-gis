import { apiClient } from './client'

export type TleUpdateRequest = {
  satellite_ids: number[] | null
}

export type TleUpdateResponse = {
  updated_records: number
  details: string[]
}

export async function updateTle(
  payload: TleUpdateRequest = { satellite_ids: null },
): Promise<TleUpdateResponse> {
  const { data } = await apiClient.post<TleUpdateResponse>('/api/tle/update', payload)
  return data
}