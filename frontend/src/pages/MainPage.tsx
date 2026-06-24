import { useEffect, useRef, useState } from 'react'
import MainLayout from '../components/layout/MainLayout'
import MapPanel, { type AoiPoint } from '../components/map/MapPanel'
import ResultsPanel from '../components/results/ResultsPanel'
import CalculationSidebar, {
  type CalculationFormValues,
} from '../components/sidebar/CalculationSidebar'
import { createAoi } from '../api/aois'
import {
  createCalculation,
  fetchCalculationResults,
  fetchWindowMapLayer,
} from '../api/calculations'
import { fetchSatelliteSensors, fetchSatellites } from '../api/satellites'
import {
  ensureCurrentTle,
  fetchTleStatus,
  updateTle,
  type TleStatusResponse,
} from '../api/tle'
import { useCalculationContext } from '../context/CalculationContext'
import type { GeoJsonPolygon } from '../api/aois'
import type { WindowMapLayerResponse } from '../types/calculation'
import type { Satellite, Sensor } from '../types/satellite'
import {
  DEFAULT_OBSERVATION_FILTERS,
  type ObservationFilters,
} from '../utils/observationFilters'

function buildGeoJsonPolygon(points: AoiPoint[]): GeoJsonPolygon {
  const coordinates = points.map((point) => [point.lng, point.lat])
  const firstPoint = coordinates[0]
  const lastPoint = coordinates[coordinates.length - 1]

  const isClosed =
    firstPoint[0] === lastPoint[0] &&
    firstPoint[1] === lastPoint[1]

  return {
    type: 'Polygon',
    coordinates: [isClosed ? coordinates : [...coordinates, firstPoint]],
  }
}

function geoJsonPolygonToAoiPoints(geometry: GeoJsonPolygon): AoiPoint[] {
  const ring = geometry.coordinates[0] ?? []

  const points = ring.map(([lng, lat]) => ({
    lat,
    lng,
  }))

  if (points.length > 1) {
    const first = points[0]
    const last = points[points.length - 1]

    if (first.lat === last.lat && first.lng === last.lng) {
      return points.slice(0, -1)
    }
  }

  return points
}

function getWindowLayersKey(calculationRunId: number) {
  return `satellitePlanning.windowLayers.${calculationRunId}`
}

function getObservationFiltersKey(calculationRunId: number) {
  return `satellitePlanning.observationFilters.${calculationRunId}`
}

function readSavedObservationFilters(
  calculationRunId: number,
): ObservationFilters | null {
  try {
    const raw = localStorage.getItem(getObservationFiltersKey(calculationRunId))

    return raw ? (JSON.parse(raw) as ObservationFilters) : null
  } catch {
    return null
  }
}

function saveObservationFilters(
  calculationRunId: number,
  filters: ObservationFilters,
) {
  localStorage.setItem(
    getObservationFiltersKey(calculationRunId),
    JSON.stringify(filters),
  )
}

function clearMapSessionState() {
  for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
    const key = sessionStorage.key(index)

    if (
      key?.startsWith('satellitePlanning.windowLayers.') ||
      key?.startsWith('satellitePlanning.mapView.')
    ) {
      sessionStorage.removeItem(key)
    }
  }
}

function parseBackendUtcDate(value: string): Date {
  const normalized = value.trim()

  const hasTimezone =
    normalized.endsWith('Z') ||
    /[+-]\d{2}:\d{2}$/.test(normalized)

  return new Date(
    hasTimezone ? normalized : `${normalized}Z`,
  )
}

function formatTleDateTime(
  value: string | null | undefined,
): string | null {
  if (!value) {
    return null
  }

  return `${new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'UTC',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parseBackendUtcDate(value))} UTC`
}

export default function MainPage() {
  const {
    currentResult,
    saveCalculationResult,
    clearCalculationResult,
  } = useCalculationContext()

  const [satellites, setSatellites] = useState<Satellite[]>([])
  const [sensorCatalog, setSensorCatalog] = useState<Record<number, Sensor[]>>({})
  const [observationFilters, setObservationFilters] = useState<ObservationFilters>(
    DEFAULT_OBSERVATION_FILTERS,
  )
  const isRestoringObservationFiltersRef = useRef(false)

  const [message, setMessage] = useState<string>('')
  const [isLoadingSatellites, setIsLoadingSatellites] = useState(false)
  const [isCalculating, setIsCalculating] = useState(false)
  const [isUpdatingTle, setIsUpdatingTle] = useState(false)
  const [isResultsCollapsed, setIsResultsCollapsed] = useState(false)
  const [sidebarResetKey, setSidebarResetKey] = useState(0)

  const [tleStatus, setTleStatus] =
  useState<TleStatusResponse | null>(null)

  const [aoiPoints, setAoiPoints] = useState<AoiPoint[]>([])
  const [activeWindowLayers, setActiveWindowLayers] = useState<
    WindowMapLayerResponse[]
  >([])
  const [isLoadingWindowLayer, setIsLoadingWindowLayer] = useState(false)


  useEffect(() => {
  let isActive = true

  async function initializeTle() {
    try {
      setIsUpdatingTle(true)

      const response = await ensureCurrentTle({
        satellite_ids: null,
      })

      if (!isActive) {
        return
      }

      setTleStatus(response)

      if (response.updated_records > 0) {
        setMessage(
          `TLE автоматически обновлены: ${response.updated_records} записей`,
        )
      } else if (response.is_stale) {
        setMessage(
          'Не удалось получить актуальные TLE. Используются последние сохранённые данные.',
        )
      }
    } catch (error) {
      console.error(error)

      if (isActive) {
        setMessage(
          'Не удалось проверить актуальность TLE',
        )
      }
    } finally {
      if (isActive) {
        setIsUpdatingTle(false)
      }
    }
  }

  async function refreshTleStatus() {
    try {
      const status = await fetchTleStatus()

      if (isActive) {
        setTleStatus(status)
      }
    } catch (error) {
      console.error(error)
    }
  }

  initializeTle()

  const statusTimer = window.setInterval(
    refreshTleStatus,
    60_000,
  )

  return () => {
    isActive = false
    window.clearInterval(statusTimer)
  }
}, [])

  useEffect(() => {
    const calculationRunId = currentResult?.calculation_run.calculation_run_id

    if (!calculationRunId) {
      isRestoringObservationFiltersRef.current = true
      setObservationFilters(DEFAULT_OBSERVATION_FILTERS)
      return
    }

    const savedFilters = readSavedObservationFilters(calculationRunId)

    isRestoringObservationFiltersRef.current = true
    setObservationFilters(savedFilters ?? DEFAULT_OBSERVATION_FILTERS)
  }, [currentResult?.calculation_run.calculation_run_id])

  useEffect(() => {
    const calculationRunId = currentResult?.calculation_run.calculation_run_id

    if (isRestoringObservationFiltersRef.current) {
      isRestoringObservationFiltersRef.current = false
      return
    }

    if (!calculationRunId) {
      return
    }

    saveObservationFilters(calculationRunId, observationFilters)
  }, [currentResult?.calculation_run.calculation_run_id, observationFilters])

  useEffect(() => {
    const calculationRunId = currentResult?.calculation_run.calculation_run_id

    if (!calculationRunId) {
      setActiveWindowLayers([])
      return
    }

    try {
      const raw = sessionStorage.getItem(getWindowLayersKey(calculationRunId))
      setActiveWindowLayers(raw ? JSON.parse(raw) : [])
    } catch {
      setActiveWindowLayers([])
    }
  }, [currentResult?.calculation_run.calculation_run_id])

  useEffect(() => {
    if (!currentResult?.aoi?.geometry) {
      return
    }

    setAoiPoints(geoJsonPolygonToAoiPoints(currentResult.aoi.geometry))
  }, [currentResult])

  useEffect(() => {
    async function loadSatellites() {
      try {
        setIsLoadingSatellites(true)
        const data = await fetchSatellites()
        setSatellites(data)
      } catch (error) {
        console.error(error)
        setMessage('Не удалось загрузить список спутников')
      } finally {
        setIsLoadingSatellites(false)
      }
    }

    loadSatellites()
  }, [])

  useEffect(() => {
    async function loadSensorCatalog() {
      if (satellites.length === 0) {
        setSensorCatalog({})
        return
      }

      try {
        const entries = await Promise.all(
          satellites.map(async (satellite) => {
            const sensors = await fetchSatelliteSensors(satellite.satellite_id)
            return [satellite.satellite_id, sensors] as const
          }),
        )

        setSensorCatalog(Object.fromEntries(entries))
      } catch (error) {
        console.error(error)
        setMessage('Не удалось загрузить характеристики сенсоров')
      }
    }

    loadSensorCatalog()
  }, [satellites])

  function saveActiveWindowLayers(
    calculationRunId: number,
    layers: WindowMapLayerResponse[],
  ) {
    sessionStorage.setItem(
      getWindowLayersKey(calculationRunId),
      JSON.stringify(layers),
    )
  }

  async function handleToggleWindowLayer(windowId: number) {
    if (!currentResult) {
      return
    }

    const calculationRunId = currentResult.calculation_run.calculation_run_id

    const existingLayer = activeWindowLayers.find(
      (layer) => layer.window_id === windowId,
    )

    if (existingLayer) {
      const nextLayers = activeWindowLayers.filter(
        (layer) => layer.window_id !== windowId,
      )

      setActiveWindowLayers(nextLayers)
      saveActiveWindowLayers(calculationRunId, nextLayers)
      setMessage(`Слой окна №${windowId} скрыт`)
      return
    }

    try {
      setIsLoadingWindowLayer(true)
      setMessage('Загрузка трассы и зоны покрытия выбранного окна...')

      const layer = await fetchWindowMapLayer(calculationRunId, windowId)
      const nextLayers = [...activeWindowLayers, layer]

      setActiveWindowLayers(nextLayers)
      saveActiveWindowLayers(calculationRunId, nextLayers)
      setMessage(`На карте показано окно №${windowId}`)
    } catch (error) {
      console.error(error)
      setMessage('Не удалось загрузить трассу выбранного окна')
    } finally {
      setIsLoadingWindowLayer(false)
    }
  }

  function handleAddAoiPoint(point: AoiPoint) {
    setAoiPoints((current) => [...current, point])
  }

  function handleClearAoi() {
    setAoiPoints([])
    setMessage('AOI очищена')
  }

  function handleNewCalculation() {
    setAoiPoints([])
    setActiveWindowLayers([])
    setMessage('')
    setIsResultsCollapsed(false)
    setSidebarResetKey((value) => value + 1)
    setObservationFilters(DEFAULT_OBSERVATION_FILTERS)

    clearCalculationResult()
    clearMapSessionState()
  }

  async function handleCalculate(values: CalculationFormValues) {
    if (aoiPoints.length < 3) {
      setMessage('Задайте AOI на карте: нужно минимум 3 точки полигона')
      return
    }

    try {
      setIsCalculating(true)
      setMessage('Выполняется расчёт...')

      const aoi = await createAoi({
        name: values.aoiName || 'AOI пользователя',
        geometry: buildGeoJsonPolygon(aoiPoints),
      })

      const calculation = await createCalculation({
        aoi_id: aoi.aoi_id,
        period_start: `${values.periodStart}T00:00:00Z`,
        period_end: `${values.periodEnd}T00:00:00Z`,
        step_seconds: values.stepSeconds,
        mode: values.mode,
        satellite_ids: values.mode === 'selected' ? values.satelliteIds : [],
        off_nadir_enabled: values.offNadirEnabled,
        manual_off_nadir_deg: values.manualOffNadirDeg,
        sar_look_direction: values.sarLookDirection,
      })

      const calculationId = calculation.calculation_run.calculation_run_id
      const calculationResult = await fetchCalculationResults(calculationId)

      saveCalculationResult(calculationResult)
      setMessage(`Расчёт №${calculationId} выполнен`)
    } catch (error) {
      console.error(error)
      setMessage('Ошибка при выполнении расчёта')
    } finally {
      setIsCalculating(false)
    }
  }

  async function handleUpdateTle() {
    try {
      setIsUpdatingTle(true)
      setMessage('Принудительное обновление TLE...')

      const response = await updateTle({
        satellite_ids: null,
      })

      setTleStatus(response)

      if (response.updated_records > 0) {
        setMessage(
          `TLE обновлены: ${response.updated_records} записей`,
        )
      } else {
        setMessage(
          'Новые TLE не были получены. Используются последние сохранённые данные.',
        )
      }
    } catch (error) {
      console.error(error)
      setMessage('Ошибка обновления TLE')
    } finally {
      setIsUpdatingTle(false)
    }
  }

  const tleUpdateIsRunning =
    isUpdatingTle || Boolean(tleStatus?.is_updating)

  const lastTleUpdate = formatTleDateTime(
    tleStatus?.last_updated_at,
  )

  const nextTleUpdate = formatTleDateTime(
    tleStatus?.next_update_at,
  )

  const tleStatusText = tleUpdateIsRunning
    ? 'Обновление...'
    : tleStatus == null
      ? 'Проверка...'
      : tleStatus.is_stale
        ? 'Требуется обновление'
        : 'Актуальны'

  return (
    <MainLayout
      isResultsCollapsed={isResultsCollapsed}
      sidebar={
        <CalculationSidebar
          resetKey={sidebarResetKey}
          satellites={satellites}
          isLoadingSatellites={isLoadingSatellites}
          isCalculating={isCalculating}
          isUpdatingTle={tleUpdateIsRunning}
          lastTleUpdate={lastTleUpdate}
          nextTleUpdate={nextTleUpdate}
          tleStatusText={tleStatusText}
          currentAoiName={currentResult?.aoi?.name ?? null}
          currentCalculationRun={currentResult?.calculation_run ?? null}
          currentCalculationSatelliteIds={currentResult?.satellite_ids ?? []}
          aoiPoints={aoiPoints}
          onCalculate={handleCalculate}
          onUpdateTle={handleUpdateTle}
          onClearAoi={handleClearAoi}
          onNewCalculation={handleNewCalculation}
          observationFilters={observationFilters}
          onObservationFiltersChange={setObservationFilters}
        />
      }
      map={
        <MapPanel
          aoiPoints={aoiPoints}
          isResultsCollapsed={isResultsCollapsed}
          calculationRunId={
            currentResult?.calculation_run.calculation_run_id ?? null
          }
          tracks={activeWindowLayers
            .map((layer) => layer.track)
            .filter((track): track is NonNullable<typeof track> => Boolean(track))}
          footprints={activeWindowLayers
            .map((layer) => layer.footprint)
            .filter((footprint): footprint is NonNullable<typeof footprint> =>
              Boolean(footprint),
            )}
          reachableFootprints={activeWindowLayers
            .map((layer) => layer.reachable_footprint)
            .filter((footprint): footprint is NonNullable<typeof footprint> =>
              Boolean(footprint),
            )}
          onAddAoiPoint={handleAddAoiPoint}
        />
      }
      results={
        <ResultsPanel
          result={currentResult}
          message={message}
          isCalculating={isCalculating}
          isCollapsed={isResultsCollapsed}
          selectedWindowIds={activeWindowLayers.map((layer) => layer.window_id)}
          isLoadingWindowLayer={isLoadingWindowLayer}
          satellites={satellites}
          sensorCatalog={sensorCatalog}
          onToggleWindowLayer={handleToggleWindowLayer}
          onToggleCollapse={() => setIsResultsCollapsed((value) => !value)}
          observationFilters={observationFilters}
          onObservationFiltersChange={setObservationFilters}
          showObservationFilters={false}
        />
      }
    />
  )
}