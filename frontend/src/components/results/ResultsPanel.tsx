import { useMemo, useState, type CSSProperties } from 'react'
import type {
  CalculationResultResponse,
  ObservationWindow,
} from '../../types/calculation'
import { getSatelliteColor } from '../../utils/satelliteColors'

type Props = {
  result: CalculationResultResponse | null
  message: string
  isCalculating: boolean
  isCollapsed?: boolean
  onToggleCollapse?: () => void
  selectedWindowIds?: number[]
  isLoadingWindowLayer?: boolean
  onToggleWindowLayer?: (windowId: number) => void
}

type ResultTab = 'windows' | 'satellites' | 'comparison'

type SatelliteSummary = {
  satellite_id: number
  satellite_name: string
  sensors: string
  windows_count: number
  nearest_window: string
  avg_coverage: string
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

function formatCoverage(value: number | null | undefined) {
  if (value === null || value === undefined) {
    return '—'
  }

  return `${value}%`
}

function buildCsv(windows: ObservationWindow[]) {
  const header = [
    'Спутник',
    'Сенсор',
    'Начало окна',
    'Конец окна',
    'Длительность, сек',
    // 'Угол наблюдения',
    // 'Угол отклонения',
    'Покрытие AOI, %',
  ]

  const rows = windows.map((item) => [
    item.satellite_name,
    item.sensor_name,
    item.access_start,
    item.access_end,
    String(item.duration_sec),
    // String(item.max_elevation_deg ?? ''),
    // String(item.off_nadir_deg ?? ''),
    String(item.coverage_percent ?? ''),
  ])

  return [header, ...rows]
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(';'))
    .join('\n')
}

export default function ResultsPanel({
  result,
  message,
  isCalculating,
  isCollapsed = false,
  selectedWindowIds = [],
  isLoadingWindowLayer = false,
  onToggleWindowLayer,
  onToggleCollapse,
}: Props) {
  const [activeTab, setActiveTab] = useState<ResultTab>('windows')
  const [satelliteFilter, setSatelliteFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  const windows = result?.windows ?? []

  const satelliteOptions = useMemo(() => {
    const names = Array.from(new Set(windows.map((item) => item.satellite_name)))
    return names.sort((a, b) => a.localeCompare(b))
  }, [windows])

  const filteredWindows = useMemo(() => {
    return windows.filter((item) => {
      const matchesSatellite =
        satelliteFilter === 'all' || item.satellite_name === satelliteFilter

      const query = searchQuery.trim().toLowerCase()

      const matchesSearch =
        !query ||
        item.satellite_name.toLowerCase().includes(query) ||
        item.sensor_name.toLowerCase().includes(query)

      return matchesSatellite && matchesSearch
    })
  }, [windows, satelliteFilter, searchQuery])

  const availableSatellites = new Set(windows.map((item) => item.satellite_id)).size
  const nearestWindow = windows[0]

  const windowsWithCoverage = windows.filter(
    (item) => item.coverage_percent !== null && item.coverage_percent !== undefined,
  )

  const averageCoverage =
    windowsWithCoverage.length > 0
      ? (
          windowsWithCoverage.reduce(
            (sum, item) => sum + (item.coverage_percent ?? 0),
            0,
          ) / windowsWithCoverage.length
        ).toFixed(1)
      : '—'

  const satelliteSummaries = useMemo<SatelliteSummary[]>(() => {
    const map = new Map<
      number,
      {
        satellite_id: number
        satellite_name: string
        sensors: Set<string>
        windows_count: number
        nearest_window: string
        avg_coverage_sum: number
        avg_coverage_count: number
      }
    >()

    for (const item of windows) {
      const existing = map.get(item.satellite_id)
      const hasCoverage =
        item.coverage_percent !== null && item.coverage_percent !== undefined

      if (!existing) {
        map.set(item.satellite_id, {
          satellite_id: item.satellite_id,
          satellite_name: item.satellite_name,
          sensors: new Set([item.sensor_name]),
          windows_count: 1,
          nearest_window: item.access_start,
          avg_coverage_sum: hasCoverage ? item.coverage_percent ?? 0 : 0,
          avg_coverage_count: hasCoverage ? 1 : 0,
        })
      } else {
        existing.sensors.add(item.sensor_name)
        existing.windows_count += 1

        if (new Date(item.access_start) < new Date(existing.nearest_window)) {
          existing.nearest_window = item.access_start
        }

        if (hasCoverage) {
          existing.avg_coverage_sum += item.coverage_percent ?? 0
          existing.avg_coverage_count += 1
        }
      }
    }

    return Array.from(map.values()).map((item) => ({
      satellite_id: item.satellite_id,
      satellite_name: item.satellite_name,
      sensors: Array.from(item.sensors).join(', '),
      windows_count: item.windows_count,
      nearest_window: item.nearest_window,
      avg_coverage:
        item.avg_coverage_count > 0
          ? `${(item.avg_coverage_sum / item.avg_coverage_count).toFixed(1)}%`
          : '—',
    }))
  }, [windows])

  function copyResultLink() {
    if (!result) return

    const calculationId = result.calculation_run.calculation_run_id
    const url = `${window.location.origin}/saved/${calculationId}`

    navigator.clipboard.writeText(url)
  }

  function exportCsv() {
    if (!result || filteredWindows.length === 0) return

    const csv = buildCsv(filteredWindows)
    const blob = new Blob([csv], {
      type: 'text/csv;charset=utf-8;',
    })

    const calculationId = result.calculation_run.calculation_run_id
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')

    link.href = url
    link.download = `calculation-${calculationId}-observation-windows.csv`
    link.click()

    URL.revokeObjectURL(url)
  }

  return (
    <section className={`results-panel ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="results-header">
        <div>
          <div className="section-title">Результаты расчёта</div>
          {message && <div className="hint">{message}</div>}

          {isLoadingWindowLayer && (
            <span className="results-inline-status">Загрузка слоя карты...</span>
          )}
        </div>

        <div className="results-actions">
          {result && (
            <>
              <button type="button" className="secondary-button" onClick={copyResultLink}>
                Скопировать ссылку
              </button>

              <button type="button" className="secondary-button" onClick={exportCsv}>
                Экспорт CSV
              </button>
            </>
          )}

          {onToggleCollapse && (
            <button type="button" className="secondary-button" onClick={onToggleCollapse}>
              {isCollapsed ? 'Развернуть' : 'Свернуть'}
            </button>
          )}
        </div>
      </div>

      {isCollapsed && (
        <div className="collapsed-summary">
          {result
            ? `Расчёт №${result.calculation_run.calculation_run_id}: ${windows.length} окон наблюдения, ${availableSatellites} спутников`
            : 'Результаты свернуты'}
        </div>
      )}

      {!isCollapsed && (
        <>
          {isCalculating && (
            <div className="loading-box">
              Выполняется расчёт: обработка TLE-данных, модель SGP4, поиск окон...
            </div>
          )}

          {!result && !isCalculating && (
            <p>
              После выполнения расчёта здесь будут отображены окна наблюдения, доступные
              спутники и сравнительные характеристики.
            </p>
          )}

          {result && (
            <>
              <div className="result-summary-bar">
                <KpiCard
                  title="Доступных спутников"
                  value={availableSatellites.toString()}
                  subtitle="из каталога"
                />

                <KpiCard
                  title="Окон наблюдения"
                  value={windows.length.toString()}
                  subtitle="за период анализа"
                />

                <KpiCard
                  title="Ближайшее окно"
                  value={nearestWindow ? formatDateTime(nearestWindow.access_start) : '—'}
                  subtitle={nearestWindow?.satellite_name ?? ''}
                />

                <KpiCard
                  title="Среднее покрытие"
                  value={averageCoverage !== '—' ? `${averageCoverage}%` : '—'}
                  subtitle="по найденным окнам"
                />
              </div>

              <div className="results-toolbar">
                <div className="result-tabs">
                  <button
                    type="button"
                    className={activeTab === 'windows' ? 'active' : ''}
                    onClick={() => setActiveTab('windows')}
                  >
                    Окна наблюдения
                  </button>

                  <button
                    type="button"
                    className={activeTab === 'satellites' ? 'active' : ''}
                    onClick={() => setActiveTab('satellites')}
                  >
                    Спутники
                  </button>

                  <button
                    type="button"
                    className={activeTab === 'comparison' ? 'active' : ''}
                    onClick={() => setActiveTab('comparison')}
                  >
                    Сравнение
                  </button>
                </div>

                <div className="result-filters">
                  <select
                    value={satelliteFilter}
                    onChange={(event) => setSatelliteFilter(event.target.value)}
                  >
                    <option value="all">Все спутники</option>
                    {satelliteOptions.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>

                  <input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Поиск по спутнику или сенсору"
                  />
                </div>
              </div>

              {activeTab === 'windows' && (
                <ObservationWindowsTable
                  windows={filteredWindows}
                  selectedWindowIds={selectedWindowIds}
                  onToggleWindowLayer={onToggleWindowLayer}
                />
              )}

              {activeTab === 'satellites' && (
                <SatelliteSummaryTable satellites={satelliteSummaries} />
              )}

              {activeTab === 'comparison' && (
                <ComparisonTable satellites={satelliteSummaries} />
              )}
            </>
          )}
        </>
      )}
    </section>
  )
}

function KpiCard({
  title,
  value,
  subtitle,
}: {
  title: string
  value: string
  subtitle: string
}) {
  return (
    <div className="kpi-card">
      <div className="kpi-title">{title}</div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-subtitle">{subtitle}</div>
    </div>
  )
}

function ObservationWindowsTable({
  windows,
  selectedWindowIds,
  onToggleWindowLayer,
}: {
  windows: ObservationWindow[]
  selectedWindowIds: number[]
  onToggleWindowLayer?: (windowId: number) => void
}) {
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
            {/* <th>Угол наблюд.</th>
            <th>Угол откл.</th> */}
            <th>Покрытие AOI</th>
          </tr>
        </thead>

        <tbody>
          {windows.map((item) => {
            const satelliteColor = getSatelliteColor(item.satellite_id)
            const isActive = selectedWindowIds.includes(item.window_id)

            return (
              <tr
                key={item.window_id}
                className={`result-row ${isActive ? 'active' : ''}`}
                style={
                  {
                    '--satellite-color': satelliteColor,
                  } as CSSProperties
                }
                onClick={() => onToggleWindowLayer?.(item.window_id)}
              >
                <td>
                  <span
                    className="satellite-color-dot"
                    style={{ backgroundColor: satelliteColor }}
                  />
                  {item.satellite_name}
                </td>
                <td>{item.sensor_name}</td>
                <td>{formatDateTime(item.access_start)}</td>
                <td>{formatDateTime(item.access_end)}</td>
                <td>{formatDuration(item.duration_sec)}</td>
                {/* <td>{item.max_elevation_deg ?? '—'}°</td>
                <td>{item.off_nadir_deg ?? '—'}°</td> */}
                <td>{formatCoverage(item.coverage_percent)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function SatelliteSummaryTable({ satellites }: { satellites: SatelliteSummary[] }) {
  return (
    <div className="table-wrap">
      <table className="results-table">
        <thead>
          <tr>
            <th>Спутник</th>
            <th>Сенсоры</th>
            <th>Окон наблюдения</th>
            <th>Ближайшее окно</th>
            <th>Среднее покрытие</th>
          </tr>
        </thead>

        <tbody>
          {satellites.map((item) => (
            <tr key={item.satellite_id}>
              <td>{item.satellite_name}</td>
              <td>{item.sensors}</td>
              <td>{item.windows_count}</td>
              <td>{formatDateTime(item.nearest_window)}</td>
              <td>{item.avg_coverage}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ComparisonTable({ satellites }: { satellites: SatelliteSummary[] }) {
  return (
    <div className="table-wrap">
      <table className="results-table">
        <thead>
          <tr>
            <th>Критерий</th>
            {satellites.map((item) => (
              <th key={item.satellite_id}>{item.satellite_name}</th>
            ))}
          </tr>
        </thead>

        <tbody>
          <tr>
            <td>Количество окон</td>
            {satellites.map((item) => (
              <td key={item.satellite_id}>{item.windows_count}</td>
            ))}
          </tr>

          <tr>
            <td>Сенсор</td>
            {satellites.map((item) => (
              <td key={item.satellite_id}>{item.sensors}</td>
            ))}
          </tr>

          <tr>
            <td>Ближайшее окно</td>
            {satellites.map((item) => (
              <td key={item.satellite_id}>{formatDateTime(item.nearest_window)}</td>
            ))}
          </tr>

          <tr>
            <td>Среднее покрытие</td>
            {satellites.map((item) => (
              <td key={item.satellite_id}>{item.avg_coverage}</td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}