import { apiClient } from './client'
import type {
  CalculationPlaceholderResponse,
  CalculationRequest,
  CalculationResultResponse,
  CalculationRun,
  WindowMapLayerResponse,
} from '../types/calculation'

export async function fetchWindowMapLayer(
  calculationRunId: number,
  windowId: number,
): Promise<WindowMapLayerResponse> {
  const { data } = await apiClient.get<WindowMapLayerResponse>(
    `/api/calculations/${calculationRunId}/windows/${windowId}/map-layer`,
  )

  return data
}

export async function createCalculation(
  payload: CalculationRequest,
): Promise<CalculationPlaceholderResponse> {
  const { data } = await apiClient.post<CalculationPlaceholderResponse>('/api/calculations', payload)
  return data
}

export async function fetchCalculation(calculationId: number): Promise<CalculationRun> {
  const { data } = await apiClient.get<CalculationRun>(`/api/calculations/${calculationId}`)
  return data
}

export async function fetchCalculationResults(
  calculationId: number,
): Promise<CalculationResultResponse> {
  const { data } = await apiClient.get<CalculationResultResponse>(
    `/api/calculations/${calculationId}/results`,
  )
  return data
}