import { useEffect, useState } from 'react'
import ResultsPanel from '../components/results/ResultsPanel'
import { useCalculationContext } from '../context/CalculationContext'

export default function ResultsDetailPage() {
  const {
    currentCalculationId,
    currentResult,
    isLoadingCurrentResult,
    loadCalculationResult,
  } = useCalculationContext()

  const [message, setMessage] = useState('')

  useEffect(() => {
    async function loadLastResult() {
      if (!currentCalculationId) {
        setMessage('Расчёт ещё не выбран. Выполните расчёт или откройте его по ссылке.')
        return
      }

      if (currentResult) {
        setMessage(`Показан актуальный расчёт №${currentCalculationId}`)
        return
      }

      try {
        setMessage(`Загрузка расчёта №${currentCalculationId}...`)
        await loadCalculationResult(currentCalculationId)
        setMessage(`Показан актуальный расчёт №${currentCalculationId}`)
      } catch (error) {
        console.error(error)
        setMessage('Не удалось загрузить последний расчёт')
      }
    }

    loadLastResult()
  }, [currentCalculationId, currentResult, loadCalculationResult])

  return (
    <main className="results-detail-page">
      <section className="page-card">
        <div className="page-header">
          <div>
            <h2>Блок результатов расчёта</h2>
            <p>
              Здесь отображаются результаты последнего выполненного или открытого по ссылке
              расчёта.
            </p>
          </div>

          {currentCalculationId && (
            <div className="catalog-counter">
              Расчёт №{currentCalculationId}
            </div>
          )}
        </div>
      </section>

      <ResultsPanel
        result={currentResult}
        message={message}
        isCalculating={isLoadingCurrentResult}
      />
    </main>
  )
}