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

export type AoiPoint = {
  lat: number
  lng: number
}

type Props = {
  aoiPoints: AoiPoint[]
  isResultsCollapsed: boolean
  onAddAoiPoint: (point: AoiPoint) => void
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
}: {
  isResultsCollapsed: boolean
  pointsCount: number
}) {
  const map = useMap()

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      map.invalidateSize()
    }, 250)

    return () => window.clearTimeout(timeout)
  }, [map, isResultsCollapsed, pointsCount])

  return null
}

export default function MapPanel({
  aoiPoints,
  isResultsCollapsed,
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
        />

        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapClickHandler onAddAoiPoint={onAddAoiPoint} />

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
          Трассы пролёта спутников
        </div>
      </div>
    </section>
  )
}