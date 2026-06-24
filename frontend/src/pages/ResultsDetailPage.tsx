import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import ResultsPanel from '../components/results/ResultsPanel'
import { fetchCalculationResults } from '../api/calculations'
import { fetchSatelliteSensors, fetchSatellites } from '../api/satellites'
import { useCalculationContext } from '../context/CalculationContext'
import type { CalculationResultResponse } from '../types/calculation'
import type { Satellite, Sensor } from '../types/satellite'

export default function ResultsDetailPage() {
  const { calculationId } = useParams()
  const { currentResult } = useCalculationContext()

  const [savedResult, setSavedResult] = useState<CalculationResultResponse | null>(null)
  const [satellites, setSatellites] = useState<Satellite[]>([])
  const [sensorCatalog, setSensorCatalog] = useState<Record<number, Sensor[]>>({})
  const [message, setMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const result = useMemo(() => {
    return calculationId ? savedResult : currentResult
  }, [calculationId, savedResult, currentResult])

  useEffect(() => {
    async function loadSavedResult() {
      if (!calculationId) {
        setSavedResult(null)

        if (currentResult) {
          setMessage(
            `Открыт текущий расчёт №${currentResult.calculation_run.calculation_run_id}`,
          )
        } else {
          setMessage('Сначала выполните расчёт на главном экране')
        }

        return
      }

      try {
        setIsLoading(true)
        setMessage('Загрузка сохранённого расчёта...')

        const data = await fetchCalculationResults(Number(calculationId))

        setSavedResult(data)
        setMessage(`Открыт расчёт №${calculationId}`)
      } catch (error) {
        console.error(error)
        setSavedResult(null)
        setMessage('Не удалось открыть сохранённый расчёт')
      } finally {
        setIsLoading(false)
      }
    }

    loadSavedResult()
  }, [calculationId, currentResult])

  useEffect(() => {
    async function loadCatalog() {
      try {
        const satellitesData = await fetchSatellites()
        setSatellites(satellitesData)

        const entries = await Promise.all(
          satellitesData.map(async (satellite) => {
            const sensors = await fetchSatelliteSensors(satellite.satellite_id)
            return [satellite.satellite_id, sensors] as const
          }),
        )

        setSensorCatalog(Object.fromEntries(entries))
      } catch (error) {
        console.error(error)
        setMessage('Расчёт открыт, но не удалось загрузить каталог сенсоров')
      }
    }

    loadCatalog()
  }, [])

  return (
    <main className="saved-result-page">
      <ResultsPanel
        result={result}
        message={message}
        isCalculating={isLoading}
        satellites={satellites}
        sensorCatalog={sensorCatalog}
      />
    </main>
  )
}