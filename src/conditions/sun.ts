import type { SunPhase } from '../types'

export interface SunTimes {
  sunrise: Date
  sunset: Date
}

const MIN = 60_000
const GOLDEN_MIN = 60 // golden hour either side of sunrise/sunset
const BLUE_MIN = 60 // dusk window after sunset
const MIDDAY_MIN = 120 // either side of solar noon

/** Clock hour at which unwinding becomes winding down. */
const LATE_NIGHT_HOUR = 22
/** Clock hour at which the small hours give way to pre-dawn. */
const DEEP_NIGHT_END_HOUR = 4

/**
 * Fallback for when sun times are unavailable (no location) or degenerate
 * (polar day/night, where sunrise and sunset stop bracketing the day).
 * Deliberately coarse — it only has the clock to work with.
 */
export function clockPhase(now: Date): SunPhase {
  const h = now.getHours()
  if (h >= 5 && h < 7) return 'dawn'
  if (h >= 7 && h < 10) return 'morning'
  if (h >= 10 && h < 14) return 'midday'
  if (h >= 14 && h < 17) return 'afternoon'
  if (h >= 17 && h < 19) return 'sunset-golden'
  if (h >= 19 && h < 20) return 'blue-hour'
  return nightPhase(now)
}

/**
 * The after-dark stretch, split by routine rather than by the sun: evening is
 * still awake-and-unwinding, deep night is winding down, late night is the
 * small hours. Someone leaving this running overnight passes through all three.
 */
export function nightPhase(now: Date): SunPhase {
  const h = now.getHours()
  // Deep night is the small hours, late night the stretch before midnight.
  // Named the other way round these read backwards: nobody calls 10pm "deep".
  if (h < DEEP_NIGHT_END_HOUR) return 'deep-night'
  if (h >= LATE_NIGHT_HOUR) return 'late-night'
  // 04:00 until dawn is still the small hours, not the evening.
  if (h < 12) return 'deep-night'
  return 'evening'
}

/**
 * Places `now` on the sun's arc. The comparisons run in order, so on very short
 * winter days — where the golden and midday windows overlap — earlier phases
 * simply win and the sequence stays monotonic rather than producing nonsense.
 */
export function computeSunPhase(now: Date, sun: SunTimes | null): SunPhase {
  if (!sun) return clockPhase(now)

  const sunrise = sun.sunrise.getTime()
  const sunset = sun.sunset.getTime()
  if (!Number.isFinite(sunrise) || !Number.isFinite(sunset)) return clockPhase(now)
  // Polar day/night, or a malformed pair: the arc is meaningless.
  if (sunset <= sunrise) return clockPhase(now)

  const t = now.getTime()
  const noon = (sunrise + sunset) / 2

  if (t < sunrise - GOLDEN_MIN * MIN) return nightPhase(now)
  if (t < sunrise) return 'dawn'
  if (t < sunrise + GOLDEN_MIN * MIN) return 'sunrise-golden'
  if (t < noon - MIDDAY_MIN * MIN) return 'morning'
  if (t <= noon + MIDDAY_MIN * MIN) return 'midday'
  if (t < sunset - GOLDEN_MIN * MIN) return 'afternoon'
  if (t < sunset) return 'sunset-golden'
  if (t < sunset + BLUE_MIN * MIN) return 'blue-hour'
  // Past dusk the clock takes over: darkness alone does not mean bedtime.
  return nightPhase(now)
}

/**
 * Open-Meteo returns local wall-clock ISO strings ("2026-07-25T17:01") when
 * called with timezone=auto. JS parses those as local time, which is what we
 * want — but only if the device clock shares the location's timezone.
 */
export function parseSunTimes(sunrise?: string | null, sunset?: string | null): SunTimes | null {
  if (!sunrise || !sunset) return null
  const a = new Date(sunrise)
  const b = new Date(sunset)
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null
  return { sunrise: a, sunset: b }
}
