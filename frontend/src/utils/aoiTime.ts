import tzlookup from 'tz-lookup'

type GeoJsonGeometry = {
  type: string
  coordinates: unknown
}

type LonLat = {
  lon: number
  lat: number
}

function collectLonLatCoordinates(value: unknown, result: LonLat[]) {
  if (!Array.isArray(value)) {
    return
  }

  if (
    value.length >= 2 &&
    typeof value[0] === 'number' &&
    typeof value[1] === 'number'
  ) {
    result.push({
      lon: value[0],
      lat: value[1],
    })
    return
  }

  value.forEach((item) => collectLonLatCoordinates(item, result))
}

export function getAoiCenter(geometry: GeoJsonGeometry | null | undefined): LonLat | null {
  if (!geometry?.coordinates) {
    return null
  }

  const coordinates: LonLat[] = []

  collectLonLatCoordinates(geometry.coordinates, coordinates)

  if (coordinates.length === 0) {
    return null
  }

  const minLon = Math.min(...coordinates.map((point) => point.lon))
  const maxLon = Math.max(...coordinates.map((point) => point.lon))
  const minLat = Math.min(...coordinates.map((point) => point.lat))
  const maxLat = Math.max(...coordinates.map((point) => point.lat))

  return {
    lon: (minLon + maxLon) / 2,
    lat: (minLat + maxLat) / 2,
  }
}

export function getAoiTimeZone(
  geometry: GeoJsonGeometry | null | undefined,
): string {
  const center = getAoiCenter(geometry)

  if (!center) {
    return 'UTC'
  }

  try {
    return tzlookup(center.lat, center.lon)
  } catch {
    return 'UTC'
  }
}

export function formatUtcDateTime(value: string | Date): string {
  const date = new Date(value)

  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'UTC',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function formatAoiLocalDateTime(
  value: string | Date,
  timeZone: string,
): string {
  const date = new Date(value)

  return new Intl.DateTimeFormat('ru-RU', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}