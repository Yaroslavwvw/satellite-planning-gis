import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'
import type { AoiPoint } from '../map/MapPanel'
import type { CalculationRun } from '../../types/calculation'
import type { Satellite } from '../../types/satellite'
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
  type IlluminationFilter,
} from '../../utils/observationFilters'

export type CalculationFormValues = {
  aoiName: string
  periodStart: string
  periodEnd: string
  stepSeconds: number
  mode: 'all_catalog' | 'selected'
  satelliteIds: number[]
  offNadirEnabled: boolean
  manualOffNadirDeg: number | null
  sarLookDirection: 'both' | 'left' | 'right'
}

type Props = {
  resetKey: number
  satellites: Satellite[]
  isLoadingSatellites: boolean
  isCalculating: boolean
  isUpdatingTle: boolean
  lastTleUpdate: string | null
  currentAoiName: string | null
  currentCalculationRun: CalculationRun | null
  currentCalculationSatelliteIds: number[]
  aoiPoints: AoiPoint[]
  observationFilters: ObservationFilters
  onObservationFiltersChange: Dispatch<SetStateAction<ObservationFilters>>
  onCalculate: (values: CalculationFormValues) => void
  onUpdateTle: () => void
  onClearAoi: () => void
  onNewCalculation: () => void
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

function getTodayDate() {
  return formatDate(new Date())
}

function getDefaultEndDate() {
  const date = new Date()
  date.setDate(date.getDate() + 2)
  return formatDate(date)
}

export default function CalculationSidebar({
  resetKey,
  satellites,
  isLoadingSatellites,
  isCalculating,
  isUpdatingTle,
  lastTleUpdate,
  currentAoiName,
  currentCalculationRun,
  currentCalculationSatelliteIds,
  aoiPoints,
  observationFilters,
  onObservationFiltersChange,
  onCalculate,
  onUpdateTle,
  onClearAoi,
  onNewCalculation,
}: Props) {
  const todayInputValue = useMemo(() => getTodayDate(), [])

  const [aoiName, setAoiName] = useState('')
  const [periodStart, setPeriodStart] = useState(getTodayDate)
  const [periodEnd, setPeriodEnd] = useState(getDefaultEndDate)
  const [stepSeconds, setStepSeconds] = useState(60)
  const [mode, setMode] = useState<'all_catalog' | 'selected'>('all_catalog')
  const [satelliteIds, setSatelliteIds] = useState<number[]>([])
  const [offNadirEnabled, setOffNadirEnabled] = useState(false)
  const [manualOffNadirDeg, setManualOffNadirDeg] = useState(20)
  const [sarLookDirection, setSarLookDirection] = useState<'both' | 'left' | 'right'>(
    'both',
  )
  const [isObservationFiltersOpen, setIsObservationFiltersOpen] = useState(false)

  useEffect(() => {
    setAoiName('')
    setPeriodStart(getTodayDate())
    setPeriodEnd(getDefaultEndDate())
    setStepSeconds(60)
    setMode('all_catalog')
    setSatelliteIds([])
    setOffNadirEnabled(false)
    setManualOffNadirDeg(20)
    setSarLookDirection('both')
    onObservationFiltersChange(DEFAULT_OBSERVATION_FILTERS)
  }, [resetKey, onObservationFiltersChange])

  useEffect(() => {
    if (currentAoiName) {
      setAoiName(currentAoiName)
    }
  }, [currentAoiName])

  useEffect(() => {
    if (!currentCalculationRun) {
      return
    }

    setPeriodStart(currentCalculationRun.period_start.slice(0, 10))
    setPeriodEnd(currentCalculationRun.period_end.slice(0, 10))
    setStepSeconds(currentCalculationRun.step_seconds)

    const calculationWithPointing = currentCalculationRun as CalculationRun & {
      off_nadir_enabled?: boolean
      manual_off_nadir_deg?: number | null
      sar_look_direction?: 'both' | 'left' | 'right'
    }

    setOffNadirEnabled(Boolean(calculationWithPointing.off_nadir_enabled))
    setManualOffNadirDeg(calculationWithPointing.manual_off_nadir_deg ?? 20)
    setSarLookDirection(calculationWithPointing.sar_look_direction ?? 'both')

    if (currentCalculationRun.mode === 'selected') {
      setMode('selected')
      setSatelliteIds(currentCalculationSatelliteIds)
    } else {
      setMode('all_catalog')
      setSatelliteIds([])
    }
  }, [currentCalculationRun, currentCalculationSatelliteIds])

  function toggleSatellite(satelliteId: number) {
    setSatelliteIds((current) =>
      current.includes(satelliteId)
        ? current.filter((id) => id !== satelliteId)
        : [...current, satelliteId],
    )
  }

  function updateObservationFilters(partial: Partial<ObservationFilters>) {
    onObservationFiltersChange((current) => ({
      ...current,
      ...partial,
    }))
  }

  function toggleBandGroup(group: SpectralBandGroup) {
    onObservationFiltersChange((current) => {
      const exists = current.manualBandGroups.includes(group)

      return {
        ...current,
        manualBandGroups: exists
          ? current.manualBandGroups.filter((item) => item !== group)
          : [...current.manualBandGroups, group],
      }
    })
  }

  function handleSubmit() {
    const currentToday = getTodayDate()

    if (periodStart < currentToday) {
      alert('Дата начала расчёта не может быть раньше текущего дня')
      return
    }

    if (periodEnd <= periodStart) {
      alert('Дата окончания должна быть позже даты начала')
      return
    }

    if (offNadirEnabled && (manualOffNadirDeg <= 0 || manualOffNadirDeg >= 90)) {
      alert('Максимальный угол отклонения от надира должен быть больше 0° и меньше 90°')
      return
    }

    onCalculate({
      aoiName,
      periodStart,
      periodEnd,
      stepSeconds,
      mode,
      satelliteIds,
      offNadirEnabled,
      manualOffNadirDeg: offNadirEnabled ? manualOffNadirDeg : null,
      sarLookDirection,
    })
  }

  function formatCoordinate(value: number) {
    return value.toFixed(5)
  }

  return (
    <aside className="sidebar">
      <div className="section-title">Область интереса</div>

      <label htmlFor="aoiName">Название AOI</label>
      <input
        id="aoiName"
        value={aoiName}
        onChange={(event) => setAoiName(event.target.value)}
        placeholder="Введите название AOI"
      />

      <div className={aoiPoints.length >= 3 ? 'aoi-status' : 'aoi-status warning'}>
        {aoiPoints.length >= 3
          ? `AOI задана: ${aoiPoints.length} точек`
          : `AOI не завершена: ${aoiPoints.length} точек из 3`}
      </div>

      <div className="sidebar-button-row">
        <button type="button" className="secondary-button" onClick={onNewCalculation}>
          Новый расчёт
        </button>

        <button type="button" className="secondary-button" onClick={onClearAoi}>
          Очистить
        </button>
      </div>

      {aoiPoints.length > 0 && (
        <div className="aoi-coordinates">
          <div className="aoi-coordinates-title">Координаты точек</div>

          {aoiPoints.map((point, index) => (
            <div key={`${point.lat}-${point.lng}-${index}`} className="aoi-coordinate-row">
              <span>Точка {index + 1}</span>
              <strong>
                {formatCoordinate(point.lat)}, {formatCoordinate(point.lng)}
              </strong>
            </div>
          ))}
        </div>
      )}

      <div className="hint">
        Кликните по карте минимум 3 раза, чтобы задать полигон области интереса.
      </div>

      <div className="section-title">Период расчёта</div>

      <label htmlFor="periodStart">Дата начала</label>
      <input
        id="periodStart"
        type="date"
        value={periodStart}
        min={todayInputValue}
        onChange={(event) => setPeriodStart(event.target.value)}
      />

      <label htmlFor="periodEnd">Дата окончания</label>
      <input
        id="periodEnd"
        type="date"
        value={periodEnd}
        min={periodStart}
        onChange={(event) => setPeriodEnd(event.target.value)}
      />

      <div className="hint">Максимальный период: 7 суток</div>

      <div className="section-title">Выбор спутников</div>

      <label className="radio-row">
        <input
          type="radio"
          checked={mode === 'all_catalog'}
          onChange={() => setMode('all_catalog')}
        />
        Все спутники каталога
      </label>

      <label className="radio-row">
        <input
          type="radio"
          checked={mode === 'selected'}
          onChange={() => setMode('selected')}
        />
        Выбрать вручную
      </label>

      <div className="hint">
        {isLoadingSatellites
          ? 'Загрузка спутников...'
          : `Используется каталог: ${satellites.length} спутников`}
      </div>

      {mode === 'selected' && (
        <div className="satellite-checklist">
          {satellites.map((satellite) => (
            <label key={satellite.satellite_id} className="checkbox-row">
              <input
                type="checkbox"
                checked={satelliteIds.includes(satellite.satellite_id)}
                onChange={() => toggleSatellite(satellite.satellite_id)}
              />
              {satellite.name}
            </label>
          ))}
        </div>
      )}

      <div className="section-title">Фильтры результатов</div>

      <button
        type="button"
        className="sidebar-filter-toggle"
        onClick={() => setIsObservationFiltersOpen((value) => !value)}
      >
        {isObservationFiltersOpen ? 'Скрыть фильтры ▲' : 'Показать фильтры ▼'}
      </button>

      {isObservationFiltersOpen && (
        <div className="sidebar-filters-dropdown">
          <label htmlFor="observationTask">Задача наблюдения</label>
          <select
            id="observationTask"
            value={observationFilters.task}
            onChange={(event) =>
              updateObservationFilters({
                task: event.target.value as ObservationTask,
              })
            }
          >
            {Object.entries(OBSERVATION_TASK_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>

          <label htmlFor="illumination">Освещённость</label>
          <select
            id="illumination"
            value={observationFilters.illumination}
            onChange={(event) =>
              updateObservationFilters({
                illumination: event.target.value as IlluminationFilter,
              })
            }
          >
            <option value="all">Все окна</option>
            <option value="day">Только дневные</option>
            <option value="night">Только ночные</option>
          </select>

          <label htmlFor="minCoveragePercent">Мин. покрытие AOI</label>
          <select
            id="minCoveragePercent"
            value={observationFilters.minCoveragePercent}
            onChange={(event) =>
              updateObservationFilters({
                minCoveragePercent: Number(event.target.value),
              })
            }
          >
            <option value={0}>любое</option>
            <option value={10}>от 10%</option>
            <option value={25}>от 25%</option>
            <option value={50}>от 50%</option>
            <option value={75}>от 75%</option>
          </select>

          <label htmlFor="maxResolutionM">Макс. разрешение анализа</label>
          <select
            id="maxResolutionM"
            value={observationFilters.maxResolutionM}
            onChange={(event) => {
              const value = event.target.value

              updateObservationFilters({
                maxResolutionM:
                  value === 'any' ? 'any' : (Number(value) as MaxResolutionFilter),
              })
            }}
          >
            <option value="any">любое</option>
            <option value={10}>до 10 м</option>
            <option value={30}>до 30 м</option>
            <option value={100}>до 100 м</option>
            <option value={1000}>до 1000 м</option>
          </select>

          <label htmlFor="dataAccess">Тип данных</label>
          <select
            id="dataAccess"
            value={observationFilters.dataAccess}
            onChange={(event) =>
              updateObservationFilters({
                dataAccess: event.target.value as DataAccessFilter,
              })
            }
          >
            <option value="any">любые</option>
            <option value="open">только открытые</option>
          </select>

          <label htmlFor="sensorType">Тип сенсора</label>
          <select
            id="sensorType"
            value={observationFilters.sensorType}
            onChange={(event) =>
              updateObservationFilters({
                sensorType: event.target.value as SensorTypeFilter,
              })
            }
          >
            <option value="any">любой</option>
            <option value="optical">optical</option>
            <option value="thermal">thermal</option>
            <option value="sar">SAR</option>
          </select>

          <div className="sidebar-spectral-filter">
            <div className="sidebar-spectral-filter-title">Спектральные диапазоны</div>

            <div className="sidebar-band-filter-grid">
              {Object.entries(SPECTRAL_BAND_GROUP_LABELS).map(([value, label]) => {
                const group = value as SpectralBandGroup

                return (
                  <label key={group} className="sidebar-band-filter-chip">
                    <input
                      type="checkbox"
                      checked={observationFilters.manualBandGroups.includes(group)}
                      onChange={() => toggleBandGroup(group)}
                    />
                    <span>{label}</span>
                  </label>
                )
              })}
            </div>
          </div>

          <button
            type="button"
            className="secondary-button"
            onClick={() => onObservationFiltersChange(DEFAULT_OBSERVATION_FILTERS)}
          >
            Сбросить фильтры
          </button>

          {/* <div className="hint">
            Эти параметры фильтруют найденные окна по задаче, освещённости, каналам,
            разрешению и доступности данных.
          </div> */}
        </div>
      )}


      <div className="section-title">Боковое наведение</div>

      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={offNadirEnabled}
          onChange={(event) => setOffNadirEnabled(event.target.checked)}
        />
        Учитывать боковое наведение для обычных сенсоров
      </label>

      {offNadirEnabled && (
        <>
          <label htmlFor="manualOffNadirDeg">Макс. угол отклонения от надира, °</label>
          <input
            id="manualOffNadirDeg"
            type="number"
            min={1}
            max={89}
            step={0.1}
            value={manualOffNadirDeg}
            onChange={(event) => setManualOffNadirDeg(Number(event.target.value))}
          />

          <div className="hint">
            Угол применяется к обычным оптическим/тепловым сенсорам. Для MODIS/MSU-MR
            он не применяется, для SAR используется отдельная боковая зона обзора.
          </div>
        </>
      )}

      <label htmlFor="sarLookDirection">Сторона SAR-обзора</label>
      <select
        id="sarLookDirection"
        value={sarLookDirection}
        onChange={(event) =>
          setSarLookDirection(event.target.value as 'both' | 'left' | 'right')
        }
      >
        <option value="both">обе стороны</option>
        <option value="left">левая</option>
        <option value="right">правая</option>
      </select>

      <div className="hint">
        Для Kondor-FKA/SAR используется диапазон углов визирования 20°–55°.
      </div>

      <div className="section-title">Параметры расчёта</div>

      <label htmlFor="step">Шаг расчёта SGP4</label>
      <select
        id="step"
        value={stepSeconds}
        onChange={(event) => setStepSeconds(Number(event.target.value))}
      >
        <option value={30}>30 сек</option>
        <option value={60}>60 сек</option>
        <option value={120}>120 сек</option>
      </select>

      <div className="hint">Баланс точности и скорости</div>

      <button type="button" onClick={handleSubmit} disabled={isCalculating}>
        {isCalculating ? 'Выполняется расчёт...' : 'Рассчитать'}
      </button>

      <button
        type="button"
        className="secondary-button"
        onClick={onUpdateTle}
        disabled={isUpdatingTle}
      >
        {isUpdatingTle ? 'Обновление TLE...' : 'Обновить TLE'}
      </button>

      <div className="section-title">Служебная информация</div>

      <div className="service-info">
        <div>
          <span>Источник TLE</span>
          <strong>CelesTrak</strong>
        </div>

        <div>
          <span>Последнее обновление</span>
          <strong>{lastTleUpdate ?? 'Не обновлялось в текущей сессии'}</strong>
        </div>

        <div>
          <span>Модель расчёта</span>
          <strong>SGP4</strong>
        </div>

        <div>
          <span>Период анализа</span>
          <strong>до 7 суток</strong>
        </div>
      </div>
    </aside>
  )
}