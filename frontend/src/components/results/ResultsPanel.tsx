import type { CalculationResultResponse, ObservationWindow } from '../../types/calculation'

type Props = {
  result: CalculationResultResponse | null
  message: string
  isCalculating: boolean
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatDuration(seconds: number) {
  const minutes = Math.round(seconds / 60)
  return `${minutes} мин`
}

export default function ResultsPanel({ result, message, isCalculating }: Props) {
  const windows = result?.windows ?? []
  const availableSatellites = new Set(windows.map((window) => window.satellite_id)).size
  const nearestWindow = windows[0]

  function copyResultLink() {
    if (!result) return

    const calculationId = result.calculation_run.calculation_run_id
    const url = `${window.location.origin}/saved/${calculationId}`

    navigator.clipboard.writeText(url)
  }

  return (
    <section className="results-panel">
      <div className="results-header">
        <div>
          <div className="section-title">Результаты расчёта</div>
          {message && <div className="hint">{message}</div>}
        </div>

        {result && (
          <div className="results-actions">
            <button type="button" className="secondary-button" onClick={copyResultLink}>
              Скопировать ссылку
            </button>
          </div>
        )}
      </div>

      {isCalculating && (
        <div className="loading-box">
          Выполняется расчёт: обработка TLE-данных, модель SGP4, поиск окон...
        </div>
      )}

      {!result && !isCalculating && (
        <p>
          После выполнения расчёта здесь будут отображены окна наблюдения, доступные спутники и
          сравнительные характеристики.
        </p>
      )}

      {result && (
        <>
          <div className="kpi-grid">
            <KpiCard title="Доступных спутников" value={availableSatellites.toString()} subtitle="из каталога" />
            <KpiCard title="Окон наблюдения" value={windows.length.toString()} subtitle="за период анализа" />
            <KpiCard
              title="Ближайшее окно"
              value={nearestWindow ? formatDateTime(nearestWindow.access_start) : '—'}
              subtitle={nearestWindow?.satellite_name ?? ''}
            />
            <KpiCard
              title="Период анализа"
              value={`${result.calculation_run.step_seconds} сек`}
              subtitle="шаг расчёта"
            />
          </div>

          <ObservationWindowsTable windows={windows} />
        </>
      )}
    </section>
  )
}

function KpiCard({ title, value, subtitle }: { title: string; value: string; subtitle: string }) {
  return (
    <div className="kpi-card">
      <div className="kpi-title">{title}</div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-subtitle">{subtitle}</div>
    </div>
  )
}

function ObservationWindowsTable({ windows }: { windows: ObservationWindow[] }) {
  return (
    <div className="table-wrap">
      <table className="results-table">
        <thead>
          <tr>
            <th>Спутник</th>
            <th>Сенсор</th>
            <th>Начало окна</th>
            <th>Конец окна</th>
            <th>Длит.</th>
            <th>Макс. высота</th>
            <th>Угол откл.</th>
            <th>Оценка</th>
          </tr>
        </thead>
        <tbody>
          {windows.map((window) => (
            <tr key={window.window_id}>
              <td>{window.satellite_name}</td>
              <td>{window.sensor_name}</td>
              <td>{formatDateTime(window.access_start)}</td>
              <td>{formatDateTime(window.access_end)}</td>
              <td>{formatDuration(window.duration_sec)}</td>
              <td>{window.max_elevation_deg ?? '—'}°</td>
              <td>{window.off_nadir_deg ?? '—'}°</td>
              <td>{window.observation_score ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}