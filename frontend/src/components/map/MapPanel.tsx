import { MapContainer, TileLayer } from 'react-leaflet'

export default function MapPanel() {
  return (
    <section className="map-area">
      <MapContainer center={[55.751244, 37.618423]} zoom={4} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
      </MapContainer>
    </section>
  )
}
