import { useEffect } from 'react'
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

export type AoiPoint = {
  lat: number
  lng: number
}

type LatLngPosition = [number, number]

type Props = {
  aoiPoints: AoiPoint[]
  isResultsCollapsed: boolean
  tracks?: TrackLayer[]
  footprints?: FootprintLayer[]
  onAddAoiPoint: (point: AoiPoint) => void
}

const LAYER_COLORS = [
  '#2f67a6',
  '#4f9d69',
  '#d9822b',
  '#7c3aed',
  '#d64545',
  '#0f766e',
  '#ca8a04',
  '#2563eb',
]

function getLayerColor(id: number) {
  return LAYER_COLORS[id % LAYER_COLORS.length]
}

function lineStringToPositions(track: TrackLayer): LatLngPosition[] {
  return track.geometry.coordinates.map(([lng, lat]) => [lat, lng])
}

function polygonToPositions(coordinates: number[][][]): LatLngPosition[][] {
  return coordinates.map((ring) =>
    ring.map(([lng, lat]) => [lat, lng]),
  )
}

function multiPolygonToPositions(coordinates: number[][][][]): LatLngPosition[][][] {
  return coordinates.map((polygon) => polygonToPositions(polygon))
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

function MapResizeHandler({
  isResultsCollapsed,
  pointsCount,
  tracksCount,
  footprintsCount,
}: {
  isResultsCollapsed: boolean
  pointsCount: number
  tracksCount: number
  footprintsCount: number
}) {
  const map = useMap()

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      map.invalidateSize()
    }, 250)

    return () => window.clearTimeout(timeout)
  }, [map, isResultsCollapsed, pointsCount, tracksCount, footprintsCount])

  return null
}

export default function MapPanel({
  aoiPoints,
  isResultsCollapsed,
  tracks = [],
  footprints = [],
  onAddAoiPoint,
}: Props) {
  const leafletPositions = aoiPoints.map(
    (point) => [point.lat, point.lng] as [number, number],
  )

  const hasPolygon = aoiPoints.length >= 3
  const hasLine = aoiPoints.length >= 2

  return (
    <section className="map-area">
      <MapContainer
        center={[55.751244, 37.618423]}
        zoom={5}
        style={{ height: '100%', width: '100%' }}
      >
        <MapResizeHandler
          isResultsCollapsed={isResultsCollapsed}
          pointsCount={aoiPoints.length}
          tracksCount={tracks.length}
          footprintsCount={footprints.length}
        />

        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapClickHandler onAddAoiPoint={onAddAoiPoint} />

        {footprints.map((footprint, footprintIndex) => {
          const color = getLayerColor(footprint.satellite_id)

          if (footprint.geometry.type === 'Polygon') {
            return (
              <Polygon
                key={`footprint-${footprint.satellite_id}-${footprint.sensor_id}-${footprintIndex}`}
                positions={polygonToPositions(footprint.geometry.coordinates)}
                pathOptions={{
                  color,
                  weight: 1,
                  fillColor: color,
                  fillOpacity: 0.08,
                  opacity: 0.35,
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
                  weight: 1,
                  fillColor: color,
                  fillOpacity: 0.08,
                  opacity: 0.35,
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
              color: getLayerColor(track.satellite_id),
              weight: 2,
              opacity: 0.85,
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