import { apiClient } from './client'

export type GeoJsonPolygon = {
  type: 'Polygon'
  coordinates: number[][][]
}

export type AoiCreateRequest = {
  name: string
  geometry: GeoJsonPolygon
}

export type Aoi = {
  aoi_id: number
  name: string
  created_at: string
}

export async function createAoi(payload: AoiCreateRequest): Promise<Aoi> {
  const { data } = await apiClient.post<Aoi>('/api/aois', payload)
  return data
}