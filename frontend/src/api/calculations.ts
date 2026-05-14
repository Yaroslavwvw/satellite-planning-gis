import { apiClient } from './client'
import type { CalculationRequest, CalculationRun } from '../types/calculation'

export async function createCalculation(payload: CalculationRequest) {
  const { data } = await apiClient.post('/api/calculations', payload)
  return data
}

export async function fetchCalculation(calculationId: number): Promise<CalculationRun> {
  const { data } = await apiClient.get<CalculationRun>(`/api/calculations/${calculationId}`)
  return data
}
