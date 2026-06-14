import {
  useMemo,
  useState,
  type CSSProperties,
  type Dispatch,
  type SetStateAction,
} from 'react'
import type {
  CalculationResultResponse,
  ObservationWindow,
} from '../../types/calculation'
import type { Satellite, Sensor } from '../../types/satellite'
import { getSatelliteColor } from '../../utils/satelliteColors'
import {
  DEFAULT_OBSERVATION_FILTERS,
  OBSERVATION_TASK_LABELS,
  SPECTRAL_BAND_GROUP_LABELS,
  type DataAccessFilter,
  type MaxResolutionFilter,
  type ObservationFilters,
  type ObservationTask,
  type SensorTypeFilter,
  type SpectralBandGroup,
  getAnalysisResolutionM,
  getMatchingBandLines,
  hasUsedBands,
  isWindowSuitableByFilters,
} from '../../utils/observationFilters'

type Props = {
  result: CalculationResultResponse | null
  message: string
  isCalculating: boolean
  isCollapsed?: boolean
  onToggleCollapse?: () => void
  selectedWindowIds?: number[]
  isLoadingWindowLayer?: boolean
  onToggleWindowLayer?: (windowId: number) => void
  satellites: Satellite[]
  sensorCatalog: Record<number, Sensor[]>
  observationFilters?: ObservationFilters
  onObservationFiltersChange?: Dispatch<SetStateAction<ObservationFilters>>
  showObservationFilters?: boolean
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
  if (value == null) {
    return '—'
  }

  return `${value.toFixed(1)}%`
}

function formatResolution(value: number | null | undefined) {
  if (value == null) {
    return '—'
  }

  return `${value} м`
}

function formatKm(value: number | null | undefined) {
  if (value == null) {
    return '—'
  }

  return `${value.toFixed(0)} км`
}

function formatAngle(value: number | null | undefined) {
  if (value == null) {
    return '—'
  }

  return `${value.toFixed(1)}°`
}

function getSensorModeLabel(sensorModeName: string | null | undefined) {
  const normalizedName = sensorModeName?.trim()

  return normalizedName || 'Стандартный режим'
}

function buildCsv(
  windows: ObservationWindow[],
  sensorById: Map<number, Sensor>,
  filters: ObservationFilters,
) {
  const showUsedBands = hasUsedBands(filters)

  const header = [
    'Спутник',
    'Сенсор',
    'Режим съемки',
    'Полоса, км',
    'Начало окна',
    'Конец окна',
    'Длительность, сек',
    'Покрытие AOI, %',
    'Доступно при наведении, %',
    'Требуется наведение',
    'Требуемый угол, град',
    'Макс. угол режима, град',
    'Разрешение анализа, м',
    ...(showUsedBands ? ['Используемые каналы'] : []),
  ]

  const rows = windows.map((item) => {
    const sensor = sensorById.get(item.sensor_id)
    const resolution = getAnalysisResolutionM(filters, sensor)

    return [
      item.satellite_name,
      item.sensor_name,
      getSensorModeLabel(item.sensor_mode_name),
      item.swath_km != null ? String(item.swath_km) : '',
      item.access_start,
      item.access_end,
      String(item.duration_sec),
      item.coverage_percent != null ? String(item.coverage_percent) : '',
      item.reachable_coverage_percent != null
        ? String(item.reachable_coverage_percent)
        : '',
      item.requires_pointing ? 'да' : 'нет',
      item.required_off_nadir_deg != null
        ? String(item.required_off_nadir_deg)
        : '',
      item.max_off_nadir_deg != null ? String(item.max_off_nadir_deg) : '',
      resolution != null ? String(resolution) : '',
      ...(showUsedBands ? [getMatchingBandLines(filters, sensor).join(' | ')] : []),
    ]
  })

  return [header, ...rows]
    .map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';'),
    )
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
  satellites = [],
  sensorCatalog = {},
  observationFilters,
  onObservationFiltersChange,
  showObservationFilters = true,
}: Props) {
  const [activeTab, setActiveTab] = useState<ResultTab>('windows')
  const [satelliteFilter, setSatelliteFilter] = useState('all')
  const [sensorModeFilter, setSensorModeFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [localFilters, setLocalFilters] = useState<ObservationFilters>(
    DEFAULT_OBSERVATION_FILTERS,
  )

  const filters = observationFilters ?? localFilters
  const setFilters = onObservationFiltersChange ?? setLocalFilters

  const allWindows = result?.windows ?? []

  const satelliteById = useMemo(() => {
    return new Map(satellites.map((satellite) => [satellite.satellite_id, satellite]))
  }, [satellites])

  const sensorById = useMemo(() => {
    const entries = Object.values(sensorCatalog)
      .flat()
      .map((sensor) => [sensor.sensor_id, sensor] as const)

    return new Map(entries)
  }, [sensorCatalog])

  const observationFilteredWindows = useMemo(() => {
    return allWindows.filter((window) => {
      const satellite = satelliteById.get(window.satellite_id)
      const sensor = sensorById.get(window.sensor_id)

      return isWindowSuitableByFilters({
        window,
        satellite,
        sensor,
        filters,
      })
    })
  }, [allWindows, satelliteById, sensorById, filters])

  const satelliteOptions = useMemo(() => {
    const names = Array.from(
      new Set(observationFilteredWindows.map((item) => item.satellite_name)),
    )

    return names.sort((left, right) => left.localeCompare(right, 'ru'))
  }, [observationFilteredWindows])

  const sensorModeOptions = useMemo(() => {
    const modeNames = observationFilteredWindows.map((item) =>
      getSensorModeLabel(item.sensor_mode_name),
    )

    return Array.from(new Set(modeNames)).sort((left, right) =>
      left.localeCompare(right, 'ru'),
    )
  }, [observationFilteredWindows])

  const filteredWindows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()

    return observationFilteredWindows.filter((item) => {
      const itemModeName = getSensorModeLabel(item.sensor_mode_name)

      const matchesSatellite =
        satelliteFilter === 'all' || item.satellite_name === satelliteFilter

      const matchesSensorMode =
        sensorModeFilter === 'all' || itemModeName === sensorModeFilter

      const matchesSearch =
        !query ||
        item.satellite_name.toLowerCase().includes(query) ||
        item.sensor_name.toLowerCase().includes(query) ||
        itemModeName.toLowerCase().includes(query)

      return matchesSatellite && matchesSensorMode && matchesSearch
    })
  }, [observationFilteredWindows, satelliteFilter, sensorModeFilter, searchQuery])

  const availableSatellites = new Set(allWindows.map((item) => item.satellite_id)).size
  const nearestWindow = allWindows[0]

  const windowsWithCoverage = allWindows.filter(
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

    for (const item of observationFilteredWindows) {
      const existing = map.get(item.satellite_id)
      const hasCoverage =
        item.coverage_percent !== null && item.coverage_percent !== undefined
      const sensorLabel = `${item.sensor_name} / ${getSensorModeLabel(
        item.sensor_mode_name,
      )}`

      if (!existing) {
        map.set(item.satellite_id, {
          satellite_id: item.satellite_id,
          satellite_name: item.satellite_name,
          sensors: new Set([sensorLabel]),
          windows_count: 1,
          nearest_window: item.access_start,
          avg_coverage_sum: hasCoverage ? item.coverage_percent ?? 0 : 0,
          avg_coverage_count: hasCoverage ? 1 : 0,
        })
      } else {
        existing.sensors.add(sensorLabel)
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
  }, [observationFilteredWindows])

  function copyResultLink() {
    if (!result) return

    const calculationId = result.calculation_run.calculation_run_id
    const url = `${window.location.origin}/saved/${calculationId}`

    navigator.clipboard.writeText(url)
  }

  function exportCsv() {
    if (!result || filteredWindows.length === 0) return

    const csv = buildCsv(filteredWindows, sensorById, filters)
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
            ? `Расчёт №${result.calculation_run.calculation_run_id}: ${allWindows.length} окон наблюдения, ${availableSatellites} спутников`
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
                  value={allWindows.length.toString()}
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

                  <select
                    value={sensorModeFilter}
                    onChange={(event) => setSensorModeFilter(event.target.value)}
                  >
                    <option value="all">Все режимы</option>
                    {sensorModeOptions.map((modeName) => (
                      <option key={modeName} value={modeName}>
                        {modeName}
                      </option>
                    ))}
                  </select>

                  <input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Поиск по спутнику, сенсору или режиму"
                  />
                </div>
              </div>

              {activeTab === 'windows' && (
                <>
                  {showObservationFilters && (
                    <ObservationFiltersPanel
                      filters={filters}
                      allWindowsCount={allWindows.length}
                      visibleWindowsCount={filteredWindows.length}
                      onChange={setFilters}
                    />
                  )}

                  <ObservationWindowsTable
                    windows={filteredWindows}
                    selectedWindowIds={selectedWindowIds}
                    sensorById={sensorById}
                    filters={filters}
                    onToggleWindowLayer={onToggleWindowLayer}
                  />
                </>
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

function ObservationFiltersPanel({
  filters,
  allWindowsCount,
  visibleWindowsCount,
  onChange,
}: {
  filters: ObservationFilters
  allWindowsCount: number
  visibleWindowsCount: number
  onChange: Dispatch<SetStateAction<ObservationFilters>>
}) {
  function toggleBandGroup(group: SpectralBandGroup) {
    onChange((current) => {
      const exists = current.manualBandGroups.includes(group)

      return {
        ...current,
        manualBandGroups: exists
          ? current.manualBandGroups.filter((item) => item !== group)
          : [...current.manualBandGroups, group],
      }
    })
  }

  return (
    <div className="results-filters">
      <div className="results-filters-title">Фильтры задачи наблюдения</div>

      <div className="results-filters-grid">
        <label>
          Задача
          <select
            value={filters.task}
            onChange={(event) =>
              onChange((current) => ({
                ...current,
                task: event.target.value as ObservationTask,
              }))
            }
          >
            {Object.entries(OBSERVATION_TASK_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label>
          Мин. покрытие AOI
          <select
            value={filters.minCoveragePercent}
            onChange={(event) =>
              onChange((current) => ({
                ...current,
                minCoveragePercent: Number(event.target.value),
              }))
            }
          >
            <option value={0}>любое</option>
            <option value={10}>от 10%</option>
            <option value={25}>от 25%</option>
            <option value={50}>от 50%</option>
            <option value={75}>от 75%</option>
          </select>
        </label>

        <label>
          Макс. разрешение
          <select
            value={filters.maxResolutionM}
            onChange={(event) => {
              const value = event.target.value

              onChange((current) => ({
                ...current,
                maxResolutionM:
                  value === 'any'
                    ? 'any'
                    : (Number(value) as MaxResolutionFilter),
              }))
            }}
          >
            <option value="any">любое</option>
            <option value={10}>до 10 м</option>
            <option value={30}>до 30 м</option>
            <option value={100}>до 100 м</option>
            <option value={1000}>до 1000 м</option>
          </select>
        </label>

        <label>
          Тип данных
          <select
            value={filters.dataAccess}
            onChange={(event) =>
              onChange((current) => ({
                ...current,
                dataAccess: event.target.value as DataAccessFilter,
              }))
            }
          >
            <option value="any">любые</option>
            <option value="open">только открытые</option>
          </select>
        </label>

        <label>
          Тип сенсора
          <select
            value={filters.sensorType}
            onChange={(event) =>
              onChange((current) => ({
                ...current,
                sensorType: event.target.value as SensorTypeFilter,
              }))
            }
          >
            <option value="any">любой</option>
            <option value="optical">optical</option>
            <option value="thermal">thermal</option>
            <option value="sar">SAR</option>
          </select>
        </label>

        <div className="spectral-groups-filter">
          <span className="spectral-groups-filter-title">
            Спектральные группы
          </span>

          <div className="band-filter-grid">
            {Object.entries(SPECTRAL_BAND_GROUP_LABELS).map(([value, label]) => {
              const group = value as SpectralBandGroup

              return (
                <label key={group} className="band-filter-chip">
                  <input
                    type="checkbox"
                    checked={filters.manualBandGroups.includes(group)}
                    onChange={() => toggleBandGroup(group)}
                  />
                  <span>{label}</span>
                </label>
              )
            })}
          </div>
        </div>
      </div>

      <div className="results-filters-summary">
        Показано {visibleWindowsCount} из {allWindowsCount} окон
      </div>
    </div>
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
  sensorById,
  filters,
  onToggleWindowLayer,
}: {
  windows: ObservationWindow[]
  selectedWindowIds: number[]
  sensorById: Map<number, Sensor>
  filters: ObservationFilters
  onToggleWindowLayer?: (windowId: number) => void
}) {
  const showUsedBands = hasUsedBands(filters)

  return (
    <div className="table-wrap">
      <table className="results-table">
        <colgroup>
          {showUsedBands ? (
            <>
              <col style={{ width: '14%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '7%' }} />
              <col style={{ width: '11%' }} />
              <col style={{ width: '10%' }} />
              <col style={{ width: '20%' }} />
            </>
          ) : (
            <>
              <col style={{ width: '18%' }} />
              <col style={{ width: '18%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '16%' }} />
              <col style={{ width: '9%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '10%' }} />
            </>
          )}
        </colgroup>

        <thead>
          <tr>
            <th>Спутник</th>
            <th>Сенсор / режим</th>
            <th>Начало окна</th>
            <th>Конец окна</th>
            <th>Длит.</th>
            <th>Покрытие AOI</th>
            <th>Разрешение анализа</th>
            {showUsedBands && <th>Используемые каналы</th>}
          </tr>
        </thead>

        <tbody>
          {windows.map((item) => {
            const satelliteColor = getSatelliteColor(item.satellite_id)
            const isActive = selectedWindowIds.includes(item.window_id)
            const sensor = sensorById.get(item.sensor_id)
            const analysisResolution = getAnalysisResolutionM(filters, sensor)
            const matchingBandLines = getMatchingBandLines(filters, sensor)

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

                <td>
                  <div className="result-sensor-cell">
                    <div className="result-sensor-name">
                      {item.sensor_name}
                    </div>

                    <div className="result-mode-badge">
                      {getSensorModeLabel(item.sensor_mode_name)}
                    </div>

                    {item.swath_km != null && (
                      <div className="result-mode-meta">
                        Полоса: {formatKm(item.swath_km)}
                      </div>
                    )}
                  </div>
                </td>

                <td>{formatDateTime(item.access_start)}</td>
                <td>{formatDateTime(item.access_end)}</td>
                <td>{formatDuration(item.duration_sec)}</td>

                <td>
                  <div className="result-coverage-cell">
                    <div className="result-coverage-main">
                      {formatCoverage(item.coverage_percent)}
                    </div>

                    {item.requires_pointing &&
                      item.reachable_coverage_percent != null && (
                        <div className="result-coverage-pointing">
                          доступно при наведении:{' '}
                          {formatCoverage(item.reachable_coverage_percent)}
                        </div>
                      )}

                    {item.requires_pointing && (
                      <div
                        className="result-pointing-badge"
                        title={`AOI находится в зоне возможного наведения. Требуемый угол: ${formatAngle(
                          item.required_off_nadir_deg,
                        )}, максимум режима: ${formatAngle(item.max_off_nadir_deg)}`}
                      >
                        требуется наведение
                      </div>
                    )}
                  </div>
                </td>

                <td>{formatResolution(analysisResolution)}</td>

                {showUsedBands && (
                  <td className="used-bands-cell">
                    <div className="used-bands-list">
                      {matchingBandLines.map((line) => (
                        <div key={line} className="used-band-item">
                          {line}
                        </div>
                      ))}
                    </div>
                  </td>
                )}
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
