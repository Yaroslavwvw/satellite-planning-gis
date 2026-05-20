import { useEffect, useMemo, useState } from 'react'
import type { AoiPoint } from '../map/MapPanel'
import type { CalculationRun } from '../../types/calculation'
import type { Satellite } from '../../types/satellite'

export type CalculationFormValues = {
  aoiName: string
  periodStart: string
  periodEnd: string
  stepSeconds: number
  mode: 'all_catalog' | 'selected'
  satelliteIds: number[]
}

type Props = {
  satellites: Satellite[]
  isLoadingSatellites: boolean
  isCalculating: boolean
  isUpdatingTle: boolean
  lastTleUpdate: string | null
  currentAoiName: string | null
  currentCalculationRun: CalculationRun | null
  currentCalculationSatelliteIds: number[]
  aoiPoints: AoiPoint[]
  onCalculate: (values: CalculationFormValues) => void
  onUpdateTle: () => void
  onClearAoi: () => void
  onUseDemoAoi: () => void
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

export default function CalculationSidebar({
  satellites,
  isLoadingSatellites,
  isCalculating,
  isUpdatingTle,
  lastTleUpdate,
  currentAoiName,
  currentCalculationRun,
  currentCalculationSatelliteIds,
  aoiPoints,
  onCalculate,
  onUpdateTle,
  onClearAoi,
  onUseDemoAoi,
}: Props) {
  const today = useMemo(() => new Date(), [])
  const plusTwoDays = useMemo(() => {
    const date = new Date()
    date.setDate(date.getDate() + 2)
    return date
  }, [])

  const [aoiName, setAoiName] = useState('')
  const [periodStart, setPeriodStart] = useState(formatDate(today))
  const [periodEnd, setPeriodEnd] = useState(formatDate(plusTwoDays))
  const [stepSeconds, setStepSeconds] = useState(60)
  const [mode, setMode] = useState<'all_catalog' | 'selected'>('all_catalog')
  const [satelliteIds, setSatelliteIds] = useState<number[]>([])

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

  function handleSubmit() {
    onCalculate({
      aoiName,
      periodStart,
      periodEnd,
      stepSeconds,
      mode,
      satelliteIds,
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
        <button type="button" className="secondary-button" onClick={onUseDemoAoi}>
          Демо AOI
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
        onChange={(event) => setPeriodStart(event.target.value)}
      />

      <label htmlFor="periodEnd">Дата окончания</label>
      <input
        id="periodEnd"
        type="date"
        value={periodEnd}
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

        <div>
          <span>Текущий режим</span>
          <strong>прототипные окна наблюдения</strong>
        </div>
      </div>
    </aside>
  )
}