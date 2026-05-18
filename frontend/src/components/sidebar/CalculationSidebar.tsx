import { useMemo, useState } from 'react'
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
  onCalculate: (values: CalculationFormValues) => void
  onUpdateTle: () => void
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
  onCalculate,
  onUpdateTle,
}: Props) {
  const today = useMemo(() => new Date(), [])
  const plusTwoDays = useMemo(() => {
    const date = new Date()
    date.setDate(date.getDate() + 2)
    return date
  }, [])

  const [aoiName, setAoiName] = useState('Test AOI - Moscow Region')
  const [periodStart, setPeriodStart] = useState(formatDate(today))
  const [periodEnd, setPeriodEnd] = useState(formatDate(plusTwoDays))
  const [stepSeconds, setStepSeconds] = useState(60)
  const [mode, setMode] = useState<'all_catalog' | 'selected'>('all_catalog')
  const [satelliteIds, setSatelliteIds] = useState<number[]>([])

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

  return (
    <aside className="sidebar">
      <div className="section-title">Область интереса</div>

      <label htmlFor="aoiName">Название AOI</label>
      <input
        id="aoiName"
        value={aoiName}
        onChange={(event) => setAoiName(event.target.value)}
        placeholder="Например: Полигон №1"
      />

      <div className="aoi-status">Тестовый полигон: Московский регион</div>

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

      <label htmlFor="step">Шаг расчёта (SGP4)</label>
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

      <button type="button" className="secondary-button" onClick={onUpdateTle} disabled={isUpdatingTle}>
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