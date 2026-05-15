import { useEffect, useState } from 'react'
import MainLayout from '../components/layout/MainLayout'
import MapPanel from '../components/map/MapPanel'
import ResultsPanel from '../components/results/ResultsPanel'
import CalculationSidebar, {
  type CalculationFormValues,
} from '../components/sidebar/CalculationSidebar'
import { createAoi } from '../api/aois'
import { createCalculation, fetchCalculationResults } from '../api/calculations'
import { fetchSatellites } from '../api/satellites'
import { updateTle } from '../api/tle'
import type { CalculationResultResponse } from '../types/calculation'
import type { Satellite } from '../types/satellite'

const DEMO_AOI_POLYGON = {
  type: 'Polygon' as const,
  coordinates: [
    [
      [36.5, 55.2],
      [38.5, 55.2],
      [38.5, 56.2],
      [36.5, 56.2],
      [36.5, 55.2],
    ],
  ],
}

export default function MainPage() {
  const [satellites, setSatellites] = useState<Satellite[]>([])
  const [result, setResult] = useState<CalculationResultResponse | null>(null)
  const [message, setMessage] = useState<string>('')
  const [isLoadingSatellites, setIsLoadingSatellites] = useState(false)
  const [isCalculating, setIsCalculating] = useState(false)
  const [isUpdatingTle, setIsUpdatingTle] = useState(false)

  useEffect(() => {
    async function loadSatellites() {
      try {
        setIsLoadingSatellites(true)
        const data = await fetchSatellites()
        setSatellites(data)
      } catch (error) {
        console.error(error)
        setMessage('Не удалось загрузить список спутников')
      } finally {
        setIsLoadingSatellites(false)
      }
    }

    loadSatellites()
  }, [])

  async function handleCalculate(values: CalculationFormValues) {
    try {
      setIsCalculating(true)
      setMessage('Выполняется расчёт...')
      setResult(null)

      const aoi = await createAoi({
        name: values.aoiName || 'Demo AOI - Moscow Region',
        geometry: DEMO_AOI_POLYGON,
      })

      const calculation = await createCalculation({
        aoi_id: aoi.aoi_id,
        period_start: `${values.periodStart}T00:00:00`,
        period_end: `${values.periodEnd}T00:00:00`,
        step_seconds: values.stepSeconds,
        mode: values.mode,
        satellite_ids: values.mode === 'selected' ? values.satelliteIds : [],
      })

      const calculationId = calculation.calculation_run.calculation_run_id
      const calculationResult = await fetchCalculationResults(calculationId)

      setResult(calculationResult)
      setMessage(`Расчёт №${calculationId} выполнен`)
    } catch (error) {
      console.error(error)
      setMessage('Ошибка при выполнении расчёта')
    } finally {
      setIsCalculating(false)
    }
  }

  async function handleUpdateTle() {
    try {
      setIsUpdatingTle(true)
      setMessage('Обновление TLE...')
      const response = await updateTle({ satellite_ids: null })
      setMessage(`TLE обновлены: ${response.updated_records} записей`)
    } catch (error) {
      console.error(error)
      setMessage('Ошибка обновления TLE')
    } finally {
      setIsUpdatingTle(false)
    }
  }

  return (
    <MainLayout
      sidebar={
        <CalculationSidebar
          satellites={satellites}
          isLoadingSatellites={isLoadingSatellites}
          isCalculating={isCalculating}
          isUpdatingTle={isUpdatingTle}
          onCalculate={handleCalculate}
          onUpdateTle={handleUpdateTle}
        />
      }
      map={<MapPanel />}
      results={
        <ResultsPanel
          result={result}
          message={message}
          isCalculating={isCalculating}
        />
      }
    />
  )
}