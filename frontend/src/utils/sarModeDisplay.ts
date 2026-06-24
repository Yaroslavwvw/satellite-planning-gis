export type SarModeDisplayInfo = {
  resolutionRange: string
  swathRange: string
  calculationResolutionM: number
  calculationSwathKm: number
}

const SAR_MODE_DISPLAY: Record<string, SarModeDisplayInfo> = {
  spotlight: {
    resolutionRange: '1–2 м',
    swathRange: '10–20 км',
    calculationResolutionM: 2,
    calculationSwathKm: 10,
  },
  stripmap: {
    resolutionRange: '1–3 м',
    swathRange: '10–20 км',
    calculationResolutionM: 3,
    calculationSwathKm: 20,
  },
  scansar: {
    resolutionRange: '5–30 м',
    swathRange: '20–150 км',
    calculationResolutionM: 30,
    calculationSwathKm: 150,
  },
}

function normalizeModeName(modeName: string | null | undefined) {
  return (modeName ?? '').trim().toLowerCase()
}

export function getSarModeDisplayInfo(modeName: string | null | undefined) {
  return SAR_MODE_DISPLAY[normalizeModeName(modeName)] ?? null
}

export function formatSensorModeOption(modeName: string | null | undefined) {
  const normalizedName = modeName?.trim() || 'Стандартный'
  const info = getSarModeDisplayInfo(modeName)

  if (!info) {
    return normalizedName
  }

  return `${normalizedName} — ${info.resolutionRange} / ${info.swathRange}`
}

export function getSarModeCalculationResolutionM(
  modeName: string | null | undefined,
) {
  return getSarModeDisplayInfo(modeName)?.calculationResolutionM ?? null
}

export function getSarModeCalculationSwathKm(
  modeName: string | null | undefined,
) {
  return getSarModeDisplayInfo(modeName)?.calculationSwathKm ?? null
}