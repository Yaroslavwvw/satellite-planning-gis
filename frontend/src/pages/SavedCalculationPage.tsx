
import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'

import ResultsPanel from '../components/results/ResultsPanel'
import { fetchSatelliteSensors, fetchSatellites } from '../api/satellites'
import { useCalculationContext } from '../context/CalculationContext'

import type { Satellite, Sensor } from '../types/satellite'

export default function SavedCalculationPage() {
  const { calculationId } = useParams()

  const {
    currentCalculationId,
    currentResult,
    loadCalculationResult,
  } = useCalculationContext()

  const [satellites, setSatellites] = useState<Satellite[]>([])
  const [sensorCatalog, setSensorCatalog] = useState<
    Record<number, Sensor[]>
  >({})

  const [message, setMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  const numericCalculationId = useMemo(() => {
    if (!calculationId) {
      return null
    }

    const parsed = Number(calculationId)

    return Number.isNaN(parsed) ? null : parsed
  }, [calculationId])

  const visibleResult =
    numericCalculationId !== null &&
    currentCalculationId === numericCalculationId
      ? currentResult
      : null

  useEffect(() => {
    async function loadSavedCalculation() {
      if (numericCalculationId === null) {
        setMessage('Некорректный идентификатор расчёта')
        return
      }

      try {
        setIsLoading(true)
        setMessage(
          `Загрузка сохранённого расчёта №${numericCalculationId}...`,
        )

        await loadCalculationResult(numericCalculationId)

        setMessage(
          `Сохранённый расчёт №${numericCalculationId} открыт`,
        )
      } catch (error) {
        console.error(error)
        setMessage('Не удалось загрузить сохранённый расчёт')
      } finally {
        setIsLoading(false)
      }
    }

    loadSavedCalculation()
  }, [numericCalculationId, loadCalculationResult])

  useEffect(() => {
    async function loadCatalog() {
      try {
        const satellitesData = await fetchSatellites()

        setSatellites(satellitesData)

        const entries = await Promise.all(
          satellitesData.map(async (satellite) => {
            const sensors = await fetchSatelliteSensors(
              satellite.satellite_id,
            )

            return [satellite.satellite_id, sensors] as const
          }),
        )

        setSensorCatalog(Object.fromEntries(entries))
      } catch (error) {
        console.error(error)
        setMessage(
          'Расчёт открыт, но не удалось загрузить каталог сенсоров',
        )
      }
    }

    loadCatalog()
  }, [])

  return (
    <main className="saved-page">
      <section className="page-card">
        <h2>Сохранённый расчёт</h2>

        <p>
          Результаты открыты по прямой ссылке. Идентификатор расчёта:{' '}
          <strong>{calculationId}</strong>
        </p>
      </section>

      <ResultsPanel
        result={visibleResult}
        message={message}
        isCalculating={isLoading}
        satellites={satellites}
        sensorCatalog={sensorCatalog}
      />
    </main>
  )
}
