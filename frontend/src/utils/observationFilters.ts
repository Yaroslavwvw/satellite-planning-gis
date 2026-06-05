import type { ObservationWindow } from '../types/calculation'
import type { Satellite, Sensor } from '../types/satellite'

export type ObservationTask =
  | 'none'
  | 'vegetation'
  | 'water'
  | 'fire'
  | 'snow'
  | 'urban'

export type SpectralBandGroup =
  | 'blue'
  | 'green'
  | 'red'
  | 'nir'
  | 'swir'
  | 'mwir'
  | 'tir'
  | 'pan'

export type DataAccessFilter = 'any' | 'open'
export type SensorTypeFilter = 'any' | 'optical' | 'thermal' | 'sar'
export type MaxResolutionFilter = 'any' | 10 | 30 | 100 | 1000

export type ObservationFilters = {
  task: ObservationTask
  minCoveragePercent: number
  maxResolutionM: MaxResolutionFilter
  dataAccess: DataAccessFilter
  sensorType: SensorTypeFilter
  manualBandGroups: SpectralBandGroup[]
}

type Band = Sensor['bands'][number]

type MatchedTaskBands = {
  isMatch: boolean
  effectiveResolutionM: number | null
  bands: Band[]
}

export const DEFAULT_OBSERVATION_FILTERS: ObservationFilters = {
  task: 'none',
  minCoveragePercent: 0,
  maxResolutionM: 'any',
  dataAccess: 'any',
  sensorType: 'any',
  manualBandGroups: [],
}

export const OBSERVATION_TASK_LABELS: Record<ObservationTask, string> = {
  none: 'Без задачи',
  vegetation: 'Растительность',
  water: 'Водные объекты',
  fire: 'Пожары / тепловые аномалии',
  snow: 'Снег / лёд',
  urban: 'Городская застройка',
}

export const SPECTRAL_BAND_GROUP_LABELS: Record<SpectralBandGroup, string> = {
  blue: 'Blue',
  green: 'Green',
  red: 'Red',
  nir: 'NIR',
  swir: 'SWIR',
  mwir: 'MWIR',
  tir: 'TIR',
  pan: 'PAN',
}

export function isWindowSuitableByFilters({
  window,
  satellite,
  sensor,
  filters,
}: {
  window: ObservationWindow
  satellite: Satellite | undefined
  sensor: Sensor | undefined
  filters: ObservationFilters
}) {
  const coveragePercent = window.coverage_percent ?? 0

  if (coveragePercent < filters.minCoveragePercent) {
    return false
  }

  if (filters.dataAccess === 'open' && satellite?.data_access_type !== 'open') {
    return false
  }

  if (!matchesSensorTypeFilter(sensor?.sensor_type, filters.sensorType)) {
    return false
  }

  const bandSelection = getFilterBandSelection(filters, sensor)

  if (hasUsedBands(filters) && !bandSelection.isMatch) {
    return false
  }

  const analysisResolutionM = bandSelection.effectiveResolutionM

  if (
    filters.maxResolutionM !== 'any' &&
    (analysisResolutionM === null || analysisResolutionM > filters.maxResolutionM)
  ) {
    return false
  }

  return true
}

export function hasUsedBands(filters: ObservationFilters) {
  return filters.task !== 'none' || filters.manualBandGroups.length > 0
}

export function getAnalysisResolutionM(
  filters: ObservationFilters,
  sensor: Sensor | undefined,
) {
  return getFilterBandSelection(filters, sensor).effectiveResolutionM
}

export function getMatchingBandLines(
  filters: ObservationFilters,
  sensor: Sensor | undefined,
) {
  if (!hasUsedBands(filters)) {
    return []
  }

  return getFilterBandSelection(filters, sensor).bands.map(formatBandWithoutResolution)
}

function getFilterBandSelection(
  filters: ObservationFilters,
  sensor: Sensor | undefined,
): MatchedTaskBands {
  if (!sensor) {
    return noMatch()
  }

  if (!hasUsedBands(filters)) {
    return {
      isMatch: true,
      effectiveResolutionM: getBestSensorResolutionM(sensor),
      bands: [],
    }
  }

  const selectedBands: Band[] = []

  if (filters.task !== 'none') {
    const taskBands = getTaskBands(filters.task, sensor)

    if (!taskBands.isMatch) {
      return noMatch()
    }

    selectedBands.push(...taskBands.bands)
  }

  if (filters.manualBandGroups.length > 0) {
    const manualBands = getManualSelectedBands(filters.manualBandGroups, sensor)

    if (!manualBands.isMatch) {
      return noMatch()
    }

    selectedBands.push(...manualBands.bands)
  }

  const uniqueBands = getUniqueBands(selectedBands)
  const resolutions = uniqueBands
    .map((band) => band.spatial_resolution_m)
    .filter((value): value is number => value !== null && value !== undefined)

  return {
    isMatch: uniqueBands.length > 0,
    effectiveResolutionM:
      resolutions.length > 0 ? Math.max(...resolutions) : null,
    bands: uniqueBands,
  }
}

function getManualSelectedBands(
  groups: SpectralBandGroup[],
  sensor: Sensor,
): MatchedTaskBands {
  const bands = getDetailedBands(sensor)

  const selected = groups.map((group) => findBandByGroup(bands, group))

  if (selected.some((band) => band === null)) {
    return noMatch()
  }

  return buildRequiredBandsResult(selected)
}

function findBandByGroup(bands: Band[], group: SpectralBandGroup) {
  if (group === 'blue') return findBestBand(bands, isBlueBand)
  if (group === 'green') return findBestBand(bands, isGreenBand)
  if (group === 'red') return findBestBand(bands, isRedBand)
  if (group === 'nir') return findBestBand(bands, isNirBand)
  if (group === 'swir') return findBestBand(bands, isSwirBand)
  if (group === 'mwir') return findBestBand(bands, isMwirBand, scoreMwirFireBand)
  if (group === 'tir') return findBestBand(bands, isTirBand, scoreTirSurfaceBand)
  if (group === 'pan') return findBestBand(bands, isPanchromaticBand)

  return null
}

function getTaskBands(
  task: ObservationTask,
  sensor: Sensor,
): MatchedTaskBands {
  const bands = getDetailedBands(sensor)

  if (task === 'vegetation') {
    return buildRequiredBandsResult([
      findBestBand(bands, isRedBand),
      findBestBand(bands, isNirBand),
    ])
  }

  if (task === 'water') {
    const green = findBestBand(bands, isGreenBand)
    const swir = findBestBand(bands, isSwirBand)
    const nir = findBestBand(bands, isNirBand)

    return buildRequiredBandsResult([green, swir ?? nir])
  }

  if (task === 'fire') {
    const mwirFire = findBestBand(bands, isMwirFireBand, scoreMwirFireBand)
    const tirSurface = findBestBand(bands, isTirSurfaceBand, scoreTirSurfaceBand)
    const swir = findBestBand(bands, isSwirBand)

    if (mwirFire && tirSurface) {
      return buildRequiredBandsResult([mwirFire, tirSurface])
    }

    if (mwirFire) {
      return buildRequiredBandsResult([mwirFire])
    }

    if (swir) {
      return buildRequiredBandsResult([swir])
    }

    return noMatch()
  }

  if (task === 'snow') {
    return buildRequiredBandsResult([
      findBestBand(bands, isGreenBand),
      findBestBand(bands, isSwirBand),
    ])
  }

  if (task === 'urban') {
    const pan = findBestBand(bands, isPanchromaticBand)
    const nir = findBestBand(bands, isNirBand)
    const swir = findBestBand(bands, isSwirBand)
    const red = findBestBand(bands, isRedBand)

    if (pan) {
      return buildRequiredBandsResult([pan])
    }

    if (nir && swir) {
      return buildRequiredBandsResult([nir, swir])
    }

    return buildRequiredBandsResult([red, nir])
  }

  return noMatch()
}

function getBestSensorResolutionM(sensor: Sensor | undefined) {
  if (!sensor) {
    return null
  }

  const detailedBands = getDetailedBands(sensor)

  const bandResolutions = detailedBands
    .map((band) => band.spatial_resolution_m)
    .filter((value): value is number => value !== null && value !== undefined)

  if (bandResolutions.length > 0) {
    return Math.min(...bandResolutions)
  }

  const modeResolutions = sensor.modes
    ?.map((mode) => mode.spatial_resolution_m)
    .filter((value): value is number => value !== null && value !== undefined)

  if (modeResolutions && modeResolutions.length > 0) {
    return Math.min(...modeResolutions)
  }

  return null
}

function buildRequiredBandsResult(items: Array<Band | null>): MatchedTaskBands {
  if (items.some((item) => item === null)) {
    return noMatch()
  }

  const bands = getUniqueBands(items.filter((item): item is Band => item !== null))

  const resolutions = bands
    .map((band) => band.spatial_resolution_m)
    .filter((value): value is number => value !== null && value !== undefined)

  return {
    isMatch: bands.length > 0,
    effectiveResolutionM:
      resolutions.length > 0 ? Math.max(...resolutions) : null,
    bands,
  }
}

function noMatch(): MatchedTaskBands {
  return {
    isMatch: false,
    effectiveResolutionM: null,
    bands: [],
  }
}

function getUniqueBands(bands: Band[]) {
  const map = new Map<string, Band>()

  for (const band of bands) {
    const key = String(
      band.band_id ??
        `${band.sensor_id}-${band.band_code}-${band.band_name}-${band.wavelength_min_nm}-${band.wavelength_max_nm}`,
    )

    map.set(key, band)
  }

  return Array.from(map.values())
}

function getDetailedBands(sensor: Sensor) {
  return sensor.bands.filter((band) => !band.is_grouped)
}

function findBestBand(
  bands: Band[],
  predicate: (band: Band) => boolean,
  score: (band: Band) => number = () => 0,
): Band | null {
  const matched = bands.filter(predicate)

  if (matched.length === 0) {
    return null
  }

  return [...matched].sort((a, b) => {
    const scoreA = score(a)
    const scoreB = score(b)

    if (scoreA !== scoreB) {
      return scoreA - scoreB
    }

    const resolutionA = a.spatial_resolution_m ?? Number.POSITIVE_INFINITY
    const resolutionB = b.spatial_resolution_m ?? Number.POSITIVE_INFINITY

    if (resolutionA !== resolutionB) {
      return resolutionA - resolutionB
    }

    return formatBandCode(a).localeCompare(formatBandCode(b), 'ru')
  })[0]
}

function formatBandWithoutResolution(band: Band) {
  const code = formatBandCode(band)
  const name = band.band_name ?? 'канал без названия'
  const range = formatBandRange(band)

  return `${code} ${name} — ${range}`
}

function formatBandCode(band: Band) {
  return band.band_code ?? '—'
}

function formatBandRange(band: Band) {
  if (
    band.wavelength_min_nm === null ||
    band.wavelength_min_nm === undefined ||
    band.wavelength_max_nm === null ||
    band.wavelength_max_nm === undefined
  ) {
    return 'диапазон не указан'
  }

  return `${band.wavelength_min_nm}–${band.wavelength_max_nm} нм`
}

function normalizeSensorType(value: string | null | undefined) {
  const normalized = value?.toLowerCase().trim() ?? ''

  if (
    normalized.includes('sar') ||
    normalized.includes('radar') ||
    normalized.includes('радиолока')
  ) {
    return 'sar'
  }

  if (
    normalized.includes('thermal') ||
    normalized.includes('tir') ||
    normalized.includes('теплов')
  ) {
    return 'thermal'
  }

  if (
    normalized.includes('optical') ||
    normalized.includes('multispectral') ||
    normalized.includes('panchromatic') ||
    normalized.includes('visible') ||
    normalized.includes('оптичес')
  ) {
    return 'optical'
  }

  return 'unknown'
}

function matchesSensorTypeFilter(
  sensorType: string | null | undefined,
  filter: SensorTypeFilter,
) {
  if (filter === 'any') {
    return true
  }

  return normalizeSensorType(sensorType) === filter
}

function bandText(band: Band) {
  return `${band.band_code ?? ''} ${band.band_name ?? ''} ${band.band_type ?? ''}`
    .toLowerCase()
}

function includesBandText(band: Band, value: string) {
  return bandText(band).includes(value)
}

function intersectsRange(band: Band, targetMin: number, targetMax: number) {
  const min = band.wavelength_min_nm
  const max = band.wavelength_max_nm

  if (min === null || min === undefined || max === null || max === undefined) {
    return false
  }

  return min <= targetMax && max >= targetMin
}

function isBlueBand(band: Band) {
  return includesBandText(band, 'blue') || intersectsRange(band, 430, 520)
}

function isGreenBand(band: Band) {
  return includesBandText(band, 'green') || intersectsRange(band, 500, 600)
}

function isRedBand(band: Band) {
  return includesBandText(band, 'red') || intersectsRange(band, 620, 700)
}

function isNirBand(band: Band) {
  return includesBandText(band, 'nir') || intersectsRange(band, 700, 1000)
}

function isSwirBand(band: Band) {
  return includesBandText(band, 'swir') || intersectsRange(band, 1000, 2500)
}

function isMwirBand(band: Band) {
  return includesBandText(band, 'mwir') || intersectsRange(band, 3500, 4100)
}

function isMwirFireBand(band: Band) {
  return (
    includesBandText(band, 'fire') ||
    includesBandText(band, 'mwir') ||
    intersectsRange(band, 3500, 4100)
  )
}

function scoreMwirFireBand(band: Band) {
  if (includesBandText(band, 'fire')) return 0
  if (intersectsRange(band, 3900, 4000)) return 1
  if (includesBandText(band, 'mwir')) return 2
  return 3
}

function isTirBand(band: Band) {
  return (
    includesBandText(band, 'tir') ||
    includesBandText(band, 'thermal') ||
    intersectsRange(band, 8000, 15000)
  )
}

function isTirSurfaceBand(band: Band) {
  return (
    includesBandText(band, 'surface temperature') ||
    includesBandText(band, 'tir') ||
    intersectsRange(band, 8000, 12500)
  )
}

function scoreTirSurfaceBand(band: Band) {
  if (includesBandText(band, 'surface temperature')) return 0
  if (intersectsRange(band, 10700, 12300)) return 1
  if (includesBandText(band, 'tir')) return 2
  return 3
}

function isPanchromaticBand(band: Band) {
  return (
    band.band_type === 'panchromatic' ||
    includesBandText(band, 'panchromatic') ||
    includesBandText(band, 'pan')
  )
}