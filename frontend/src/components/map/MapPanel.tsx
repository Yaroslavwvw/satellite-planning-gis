import { useEffect, useMemo, useState } from 'react'
import {
  CircleMarker,
  MapContainer,
  Polygon,
  Polyline,
  TileLayer,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import type { FootprintLayer, TrackLayer } from '../../types/calculation'
import { getSatelliteColor } from '../../utils/satelliteColors'

export type AoiPoint = {
  lat: number
  lng: number
}

type LatLngPosition = [number, number]

type Props = {
  aoiPoints: AoiPoint[]
  isResultsCollapsed: boolean
  calculationRunId?: number | null
  tracks?: TrackLayer[]
  footprints?: FootprintLayer[]
  onAddAoiPoint: (point: AoiPoint) => void
}

type StoredMapView = {
  center: [number, number]
  zoom: number
}

function getMapViewKey(calculationRunId?: number | null) {
  return calculationRunId
    ? `satellitePlanning.mapView.${calculationRunId}`
    : 'satellitePlanning.mapView.draft'
}

function readStoredMapView(key: string): StoredMapView | null {
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? (JSON.parse(raw) as StoredMapView) : null
  } catch {
    return null
  }
}

function saveStoredMapView(key: string, view: StoredMapView) {
  sessionStorage.setItem(key, JSON.stringify(view))
}

function lineStringToPositions(track: TrackLayer): LatLngPosition[] {
  return track.geometry.coordinates.map(([lng, lat]) => [lat, lng])
}

function polygonToPositions(coordinates: number[][][]): LatLngPosition[][] {
  return coordinates.map((ring) => ring.map(([lng, lat]) => [lat, lng]))
}

function multiPolygonToPositions(coordinates: number[][][][]): LatLngPosition[][][] {
  return coordinates.map((polygon) => polygonToPositions(polygon))
}

function formatCoordinate(value: number, positive: string, negative: string) {
  const direction = value >= 0 ? positive : negative
  const absolute = Math.abs(value)
  const degrees = Math.floor(absolute)
  const minutes = Math.round((absolute - degrees) * 60)

  return `${degrees}°${minutes.toString().padStart(2, '0')}'${direction}`
}

function getScaleText(zoom: number, latitude: number) {
  const metersPerPixel =
    (156543.03392 * Math.cos((latitude * Math.PI) / 180)) / Math.pow(2, zoom)

  const scale = Math.round(metersPerPixel * 3779.527559)
  return `1:${scale.toLocaleString('ru-RU')}`
}

function MapClickHandler({
  onAddAoiPoint,
}: {
  onAddAoiPoint: (point: AoiPoint) => void
}) {
  useMapEvents({
    click(event) {
      onAddAoiPoint({
        lat: event.latlng.lat,
        lng: event.latlng.lng,
      })
    },
  })

  return null
}

function MapSessionStateHandler({
  aoiPoints,
  calculationRunId,
  isResultsCollapsed,
  tracksCount,
  footprintsCount,
}: {
  aoiPoints: AoiPoint[]
  calculationRunId?: number | null
  isResultsCollapsed: boolean
  tracksCount: number
  footprintsCount: number
}) {
  const map = useMap()
  const storageKey = useMemo(
    () => getMapViewKey(calculationRunId),
    [calculationRunId],
  )

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      map.invalidateSize()
    }, 250)

    return () => window.clearTimeout(timeout)
  }, [map, isResultsCollapsed, tracksCount, footprintsCount])

  useEffect(() => {
    const storedView = readStoredMapView(storageKey)

    if (storedView) {
      map.setView(storedView.center, storedView.zoom)
      return
    }

    if (aoiPoints.length >= 3) {
      const bounds = aoiPoints.map(
        (point) => [point.lat, point.lng] as [number, number],
      )

      map.fitBounds(bounds, {
        padding: [40, 40],
        maxZoom: 7,
      })
    }
  }, [map, storageKey, aoiPoints])

  useMapEvents({
    moveend() {
      const center = map.getCenter()
      saveStoredMapView(storageKey, {
        center: [center.lat, center.lng],
        zoom: map.getZoom(),
      })
    },
  })

  return null
}

function MapStatusOverlay() {
  const map = useMap()
  const [center, setCenter] = useState(map.getCenter())
  const [zoom, setZoom] = useState(map.getZoom())

  useMapEvents({
    moveend() {
      setCenter(map.getCenter())
      setZoom(map.getZoom())
    },
    zoomend() {
      setCenter(map.getCenter())
      setZoom(map.getZoom())
    },
  })

  return (
    <div className="map-status-overlay">
      {formatCoordinate(center.lat, 'N', 'S')} {formatCoordinate(center.lng, 'E', 'W')}
      {'  |  '}
      WGS-84
      {'  |  '}
      Масштаб {getScaleText(zoom, center.lat)}
      {'  |  '}
      Картографическая основа: OpenStreetMap
    </div>
  )
}

export default function MapPanel({
  aoiPoints,
  isResultsCollapsed,
  calculationRunId = null,
  tracks = [],
  footprints = [],
  onAddAoiPoint,
}: Props) {
  const initialView = readStoredMapView(getMapViewKey(calculationRunId))

  const leafletPositions = aoiPoints.map(
    (point) => [point.lat, point.lng] as [number, number],
  )

  const hasPolygon = aoiPoints.length >= 3
  const hasLine = aoiPoints.length >= 2

  return (
    <section className="map-area">
      <MapContainer
        center={initialView?.center ?? [55.751244, 37.618423]}
        zoom={initialView?.zoom ?? 5}
        attributionControl={false}
        style={{ height: '100%', width: '100%' }}
      >
        <MapSessionStateHandler
          aoiPoints={aoiPoints}
          calculationRunId={calculationRunId}
          isResultsCollapsed={isResultsCollapsed}
          tracksCount={tracks.length}
          footprintsCount={footprints.length}
        />

        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        

        <MapClickHandler onAddAoiPoint={onAddAoiPoint} />

        {footprints.map((footprint, footprintIndex) => {
          const color = getSatelliteColor(footprint.satellite_id)

          if (footprint.geometry.type === 'Polygon') {
            return (
              <Polygon
                key={`footprint-${footprint.satellite_id}-${footprint.sensor_id}-${footprintIndex}`}
                positions={polygonToPositions(footprint.geometry.coordinates)}
                pathOptions={{
                  color,
                  weight: 1.5,
                  fillColor: color,
                  fillOpacity: 0.1,
                  opacity: 0.45,
                }}
              />
            )
          }

          return multiPolygonToPositions(footprint.geometry.coordinates).map(
            (positions, index) => (
              <Polygon
                key={`footprint-${footprint.satellite_id}-${footprint.sensor_id}-${footprintIndex}-${index}`}
                positions={positions}
                pathOptions={{
                  color,
                  weight: 1.5,
                  fillColor: color,
                  fillOpacity: 0.1,
                  opacity: 0.45,
                }}
              />
            ),
          )
        })}

        {tracks.map((track, index) => (
          <Polyline
            key={`track-${track.satellite_id}-${index}`}
            positions={lineStringToPositions(track)}
            pathOptions={{
              color: getSatelliteColor(track.satellite_id),
              weight: 3,
              opacity: 0.9,
            }}
          />
        ))}

        {hasLine && !hasPolygon && (
          <Polyline
            positions={leafletPositions}
            pathOptions={{
              color: '#2f67a6',
              weight: 3,
            }}
          />
        )}

        {hasPolygon && (
          <Polygon
            positions={leafletPositions}
            pathOptions={{
              color: '#2f67a6',
              weight: 3,
              fillColor: '#2f67a6',
              fillOpacity: 0.18,
            }}
          />
        )}

        {aoiPoints.map((point, index) => (
          <CircleMarker
            key={`${point.lat}-${point.lng}-${index}`}
            center={[point.lat, point.lng]}
            radius={6}
            pathOptions={{
              color: '#ffffff',
              weight: 2,
              fillColor: '#2f67a6',
              fillOpacity: 1,
            }}
          />
        ))}

        <MapStatusOverlay />
      </MapContainer>

      <div className="map-legend">
        <div>
          <span className="legend-box aoi" />
          Область интереса AOI
        </div>
        <div>
          <span className="legend-line" />
          SGP4-трассы спутников
        </div>
        <div>
          <span className="legend-box footprint" />
          Зоны покрытия сенсоров
        </div>
      </div>
    </section>
  )
}