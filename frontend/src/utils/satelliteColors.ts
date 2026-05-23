const SATELLITE_COLORS = [
  '#2f67a6',
  '#4f9d69',
  '#d9822b',
  '#7c3aed',
  '#d64545',
  '#0f766e',
  '#ca8a04',
  '#2563eb',
  '#be185d',
  '#0891b2',
]

export function getSatelliteColor(satelliteId: number) {
  return SATELLITE_COLORS[(satelliteId - 1) % SATELLITE_COLORS.length]
}