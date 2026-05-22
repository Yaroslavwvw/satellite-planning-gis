import { useEffect, useState } from 'react'
import MainLayout from '../components/layout/MainLayout'
import MapPanel, { type AoiPoint } from '../components/map/MapPanel'
import ResultsPanel from '../components/results/ResultsPanel'
import CalculationSidebar, {
  type CalculationFormValues,
} from '../components/sidebar/CalculationSidebar'
import { createAoi } from '../api/aois'
import { createCalculation, fetchCalculationResults, fetchWindowMapLayer, } from '../api/calculations'
import { fetchSatellites } from '../api/satellites'
import { updateTle } from '../api/tle'
import { useCalculationContext } from '../context/CalculationContext'
import type { GeoJsonPolygon } from '../api/aois'
import type { Satellite } from '../types/satellite'
import type { WindowMapLayerResponse } from '../types/calculation'

const DEMO_AOI_POINTS: AoiPoint[] = [
  { lat: 55.2, lng: 36.5 },
  { lat: 55.2, lng: 38.5 },   
  { lat: 56.2, lng: 38.5 },
  { lat: 56.2, lng: 36.5 },
]

function buildGeoJsonPolygon(points: AoiPoint[]): GeoJsonPolygon {
  const coordinates = points.map((point) => [point.lng, point.lat])
  const firstPoint = coordinates[0]
  const lastPoint = coordinates[coordinates.length - 1]

  const isClosed =
    firstPoint[0] === lastPoint[0] &&
    firstPoint[1] === lastPoint[1]

  return {
    type: 'Polygon',
    coordinates: [
      isClosed ? coordinates : [...coordinates, firstPoint],
    ],
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

export default function MainPage() {
  const { currentResult, saveCalculationResult } = useCalculationContext()

  const [satellites, setSatellites] = useState<Satellite[]>([])
  const [message, setMessage] = useState<string>('')
  const [isLoadingSatellites, setIsLoadingSatellites] = useState(false)
  const [isCalculating, setIsCalculating] = useState(false)
  const [isUpdatingTle, setIsUpdatingTle] = useState(false)

  const [isResultsCollapsed, setIsResultsCollapsed] = useState(false)
  const [lastTleUpdate, setLastTleUpdate] = useState<string | null>(() => {
    return sessionStorage.getItem('satellitePlanning.lastTleUpdate')
  })
  const [aoiPoints, setAoiPoints] = useState<AoiPoint[]>([])

  const [activeWindowLayer, setActiveWindowLayer] =
  useState<WindowMapLayerResponse | null>(null)
  const [isLoadingWindowLayer, setIsLoadingWindowLayer] = useState(false)

  useEffect(() => {
  setActiveWindowLayer(null)
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

  async function handleSelectWindow(windowId: number) {
  if (!currentResult) {
    return
  }

  try {
    setIsLoadingWindowLayer(true)
    setMessage('Загрузка трассы и зоны покрытия выбранного окна...')

    const calculationRunId = currentResult.calculation_run.calculation_run_id
    const layer = await fetchWindowMapLayer(calculationRunId, windowId)

    setActiveWindowLayer(layer)
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

  function handleUseDemoAoi() {
    setAoiPoints(DEMO_AOI_POINTS)
    setMessage('Демо AOI добавлена на карту')
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
          onUseDemoAoi={handleUseDemoAoi}
        />
      }
      map={
        <MapPanel
          aoiPoints={aoiPoints}
          isResultsCollapsed={isResultsCollapsed}
          tracks={activeWindowLayer?.track ? [activeWindowLayer.track] : []}
          footprints={activeWindowLayer?.footprint ? [activeWindowLayer.footprint] : []}
          onAddAoiPoint={handleAddAoiPoint}
        />
      }
      results={
        <ResultsPanel
          result={currentResult}
          message={message}
          isCalculating={isCalculating}
          isCollapsed={isResultsCollapsed}
          selectedWindowId={activeWindowLayer?.window_id ?? null}
          isLoadingWindowLayer={isLoadingWindowLayer}
          onSelectWindow={handleSelectWindow}
          onToggleCollapse={() => setIsResultsCollapsed((value) => !value)}
        />
      }
    />
  )
}