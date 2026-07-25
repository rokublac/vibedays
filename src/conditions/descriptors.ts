import type {
  CloudBand, Conditions, PrecipBand, SunPhase, TempBand, WeatherKind,
} from '../types'

/** In the order they occur through a day, starting after midnight. */
export const PHASES: SunPhase[] = [
  'late-night', 'dawn', 'sunrise-golden', 'morning',
  'midday', 'afternoon', 'sunset-golden', 'blue-hour',
  'evening', 'deep-night',
]

export function cloudBand(pct: number | null): CloudBand | null {
  if (pct === null) return null
  if (pct < 15) return 'clear'
  if (pct < 40) return 'hazy'
  if (pct < 70) return 'scattered'
  return 'overcast'
}

/**
 * Precipitation is banded off the mm figure so a sprinkle reads differently
 * from a downpour. Snow is called out separately — its intensity matters far
 * less than the fact that it is snow.
 */
export function precipBand(mm: number | null, kind: WeatherKind | null): PrecipBand | null {
  if (kind === 'snow') return 'snowing'
  if (mm === null) return null
  if (mm <= 0) return 'none'
  if (mm < 0.3) return 'sprinkle'
  if (mm < 1) return 'drizzle'
  if (mm < 4) return 'steady'
  return 'downpour'
}

/** Bands the feels-like temperature, so wind chill counts. */
export function tempBand(c: number | null): TempBand | null {
  if (c === null) return null
  if (c < 3) return 'freezing'
  if (c < 12) return 'cold'
  if (c < 22) return 'mild'
  if (c < 30) return 'warm'
  return 'hot'
}

/** The headline shown in the hero. */
export const PHASE_LABELS: Record<SunPhase, string> = {
  'late-night': 'Late night',
  evening: 'Evening',
  'deep-night': 'Deep night',
  dawn: 'Dawn',
  'sunrise-golden': 'Golden sunrise',
  morning: 'Morning',
  midday: 'Midday',
  afternoon: 'Afternoon',
  'sunset-golden': 'Golden hour',
  'blue-hour': 'Blue hour',
}

/** Search terms per phase — the highest-priority part of every query. */
const PHASE_TERMS: Record<SunPhase, string> = {
  // Energy winds down across these three: unwinding, then heading for bed,
  // then properly asleep. Both night phases ask for sleep, the deeper one more so.
  evening: 'evening chill unwind',
  'late-night': 'late night sleep mellow',
  'deep-night': 'deep sleep ambient dreamy',
  dawn: 'dawn early calm',
  'sunrise-golden': 'sunrise golden hour',
  morning: 'morning fresh',
  midday: 'midday bright',
  afternoon: 'afternoon study',
  'sunset-golden': 'sunset golden hour',
  'blue-hour': 'dusk blue hour',
}

/** Bands that add nothing to a search are mapped to null and dropped. */
const PRECIP_TERMS: Record<PrecipBand, string | null> = {
  none: null,
  sprinkle: 'light drizzle',
  drizzle: 'drizzle',
  steady: 'rainy',
  downpour: 'heavy rain storm',
  snowing: 'snow',
}

const CLOUD_TERMS: Record<CloudBand, string | null> = {
  clear: 'clear skies',
  hazy: null,
  scattered: 'cloudy',
  overcast: 'overcast grey',
}

const TEMP_TERMS: Record<TempBand, string | null> = {
  freezing: 'frosty',
  cold: 'cold',
  mild: null,
  warm: 'warm',
  hot: 'hot summer',
}

/**
 * Search terms in priority order: phase first, then whatever most changes the
 * character of the moment. The query ladder drops from the end, so the last
 * terms are the ones we are most willing to lose.
 */
export function describeTerms(c: Conditions): string[] {
  const terms: (string | null)[] = [
    PHASE_TERMS[c.phase],
    c.precip ? PRECIP_TERMS[c.precip] : null,
    c.cloud ? CLOUD_TERMS[c.cloud] : null,
    c.temp ? TEMP_TERMS[c.temp] : null,
    // Season needs latitude to know the hemisphere. Without location it would
    // claim summer during an Australian winter, so it is left out entirely.
    c.located ? c.season : null,
  ]
  return terms.filter((t): t is string => !!t)
}

/** Stable key for the exact combination, used to pin a playlist choice. */
export function signature(c: Conditions): string {
  return [
    c.located ? 'geo' : 'nogeo',
    c.phase, c.precip ?? '-', c.cloud ?? '-', c.temp ?? '-',
    c.located ? c.season : '-',
  ].join('|')
}

export function headline(c: Conditions): string {
  return PHASE_LABELS[c.phase]
}

/** The overline above the hero: the conditions, not the phase. */
export function conditionWords(c: Conditions): string[] {
  const words: Array<string | null> = [
    c.cloud, c.precip === 'none' ? null : c.precip, c.temp,
    c.located ? c.season : null,
  ]
  return words.filter((w): w is string => !!w)
}
