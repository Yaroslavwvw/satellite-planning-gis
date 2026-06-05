import { useEffect, useState } from 'react'
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
import { updateTle } from '../api/tle'
import { useCalculationContext } from '../context/CalculationContext'
import type { GeoJsonPolygon } from '../api/aois'
import type { WindowMapLayerResponse } from '../types/calculation'
import type { Satellite, Sensor } from '../types/satellite'

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

export default function MainPage() {
  const {
    currentResult,
    saveCalculationResult,
    clearCalculationResult,
  } = useCalculationContext()

  const [satellites, setSatellites] = useState<Satellite[]>([])
  const [sensorCatalog, setSensorCatalog] = useState<Record<number, Sensor[]>>({})

  const [message, setMessage] = useState<string>('')
  const [isLoadingSatellites, setIsLoadingSatellites] = useState(false)
  const [isCalculating, setIsCalculating] = useState(false)
  const [isUpdatingTle, setIsUpdatingTle] = useState(false)
  const [isResultsCollapsed, setIsResultsCollapsed] = useState(false)
  const [sidebarResetKey, setSidebarResetKey] = useState(0)

  const [lastTleUpdate, setLastTleUpdate] = useState<string | null>(() => {
    return sessionStorage.getItem('satellitePlanning.lastTleUpdate')
  })

  const [aoiPoints, setAoiPoints] = useState<AoiPoint[]>([])
  const [activeWindowLayers, setActiveWindowLayers] = useState<
    WindowMapLayerResponse[]
  >([])
  const [isLoadingWindowLayer, setIsLoadingWindowLayer] = useState(false)

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
        period_start: `${values.periodStart}T00:00:00`,
        period_end: `${values.periodEnd}T00:00:00`,
        step_seconds: values.stepSeconds,
        mode: values.mode,
        satellite_ids: values.mode === 'selected' ? values.satelliteIds : [],
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
      setMessage('Обновление TLE...')

      const response = await updateTle({ satellite_ids: null })

      setMessage(`TLE обновлены: ${response.updated_records} записей`)

      const updatedAt = new Date().toLocaleString('ru-RU')
      setLastTleUpdate(updatedAt)
      sessionStorage.setItem('satellitePlanning.lastTleUpdate', updatedAt)
    } catch (error) {
      console.error(error)
      setMessage('Ошибка обновления TLE')
    } finally {
      setIsUpdatingTle(false)
    }
  }

  return (
    <MainLayout
      isResultsCollapsed={isResultsCollapsed}
      sidebar={
        <CalculationSidebar
          resetKey={sidebarResetKey}
          satellites={satellites}
          isLoadingSatellites={isLoadingSatellites}
          isCalculating={isCalculating}
          isUpdatingTle={isUpdatingTle}
          lastTleUpdate={lastTleUpdate}
          currentAoiName={currentResult?.aoi?.name ?? null}
          currentCalculationRun={currentResult?.calculation_run ?? null}
          currentCalculationSatelliteIds={currentResult?.satellite_ids ?? []}
          aoiPoints={aoiPoints}
          onCalculate={handleCalculate}
          onUpdateTle={handleUpdateTle}
          onClearAoi={handleClearAoi}
          onNewCalculation={handleNewCalculation}
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
        />
      }
    />
  )
}