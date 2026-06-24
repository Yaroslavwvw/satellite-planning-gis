import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react'
import { fetchCalculationResults } from '../api/calculations'
import type { CalculationResultResponse } from '../types/calculation'

type CalculationContextValue = {
  currentCalculationId: number | null
  currentResult: CalculationResultResponse | null
  isLoadingCurrentResult: boolean
  saveCalculationResult: (result: CalculationResultResponse) => void
  loadCalculationResult: (calculationId: number) => Promise<CalculationResultResponse>
  clearCalculationResult: () => void
}

const CalculationContext = createContext<CalculationContextValue | null>(null)

const STORAGE_ID_KEY = 'satellitePlanning.currentCalculationId'
const STORAGE_RESULT_KEY = 'satellitePlanning.currentResult'

function getInitialCalculationId(): number | null {
  const value = sessionStorage.getItem(STORAGE_ID_KEY)

  if (!value) {
    return null
  }

  const parsed = Number(value)

  return Number.isNaN(parsed) ? null : parsed
}

function getInitialResult(): CalculationResultResponse | null {
  const value = sessionStorage.getItem(STORAGE_RESULT_KEY)

  if (!value) {
    return null
  }

  try {
    return JSON.parse(value) as CalculationResultResponse
  } catch {
    return null
  }
}

export function CalculationProvider({ children }: { children: ReactNode }) {
  const [currentCalculationId, setCurrentCalculationId] = useState<number | null>(
    getInitialCalculationId,
  )
  const [currentResult, setCurrentResult] = useState<CalculationResultResponse | null>(
    getInitialResult,
  )
  const [isLoadingCurrentResult, setIsLoadingCurrentResult] = useState(false)

  const saveCalculationResult = useCallback((result: CalculationResultResponse) => {
    const calculationId = result.calculation_run.calculation_run_id

    setCurrentCalculationId(calculationId)
    setCurrentResult(result)

    sessionStorage.setItem(STORAGE_ID_KEY, String(calculationId))
    sessionStorage.setItem(STORAGE_RESULT_KEY, JSON.stringify(result))
  }, [])

  const loadCalculationResult = useCallback(
    async (calculationId: number): Promise<CalculationResultResponse> => {
      setIsLoadingCurrentResult(true)

      try {
        const result = await fetchCalculationResults(calculationId)
        saveCalculationResult(result)
        return result
      } finally {
        setIsLoadingCurrentResult(false)
      }
    },
    [saveCalculationResult],
  )

  const clearCalculationResult = useCallback(() => {
    setCurrentCalculationId(null)
    setCurrentResult(null)

    sessionStorage.removeItem(STORAGE_ID_KEY)
    sessionStorage.removeItem(STORAGE_RESULT_KEY)
  }, [])

  const value = useMemo(
    () => ({
      currentCalculationId,
      currentResult,
      isLoadingCurrentResult,
      saveCalculationResult,
      loadCalculationResult,
      clearCalculationResult,
    }),
    [
      currentCalculationId,
      currentResult,
      isLoadingCurrentResult,
      saveCalculationResult,
      loadCalculationResult,
      clearCalculationResult,
    ],
  )

  return (
    <CalculationContext.Provider value={value}>
      {children}
    </CalculationContext.Provider>
  )
}

export function useCalculationContext() {
  const context = useContext(CalculationContext)

  if (!context) {
    throw new Error('useCalculationContext must be used inside CalculationProvider')
  }

  return context
}