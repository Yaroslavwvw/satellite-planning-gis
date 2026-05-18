import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import ResultsPanel from '../components/results/ResultsPanel'
import { useCalculationContext } from '../context/CalculationContext'

export default function SavedCalculationPage() {
  const { calculationId } = useParams()
  const {
    currentCalculationId,
    currentResult,
    loadCalculationResult,
  } = useCalculationContext()

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
    numericCalculationId !== null && currentCalculationId === numericCalculationId
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
        setMessage(`Загрузка сохранённого расчёта №${numericCalculationId}...`)

        await loadCalculationResult(numericCalculationId)

        setMessage(`Сохранённый расчёт №${numericCalculationId} открыт`)
      } catch (error) {
        console.error(error)
        setMessage('Не удалось загрузить сохранённый расчёт')
      } finally {
        setIsLoading(false)
      }
    }

    loadSavedCalculation()
  }, [numericCalculationId, loadCalculationResult])

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
      />
    </main>
  )
}