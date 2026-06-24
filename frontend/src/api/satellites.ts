import { apiClient } from './client'
import type { Satellite, Sensor } from '../types/satellite'

export async function fetchSatellites(): Promise<Satellite[]> {
  const { data } = await apiClient.get<Satellite[]>('/api/satellites')
  return data
}

export async function fetchSatelliteSensors(satelliteId: number): Promise<Sensor[]> {
  const { data } = await apiClient.get<Sensor[]>(`/api/satellites/${satelliteId}/sensors`)
  return data
}