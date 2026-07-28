import type { SunPhase, Season, WeatherKind, Coords } from '../types'

export interface Diagnostics {
  /** Last playback failure, surfaced on screen because phones have no console. */
  issue: string | null
  now: Date
  phase: SunPhase
  sunrise: Date | null
  sunset: Date | null
  cloudCover: number | null
  precipitationMm: number | null
  season: Season
  source: 'geolocation' | 'city' | 'none'
  coords: Coords | null
  place: string | null
  weatherCode: number | null
  weatherKind: WeatherKind | null
  temperatureC: number | null
}

function hm(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

/**
 * "25 July 2026 · 19:25". Spelled out rather than Intl-formatted so the output
 * does not shift with the machine's locale.
 */
function ts(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()} · ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** Full precision coordinates are noise; two decimals is ~1km, plenty here. */
function place(d: Diagnostics): string {
  if (d.place) return d.place
  if (d.coords) return `${d.coords.latitude.toFixed(2)}, ${d.coords.longitude.toFixed(2)}`
  return d.source === 'none' ? 'unavailable' : '—'
}

function weather(d: Diagnostics): string {
  if (d.weatherKind === null) return '—'
  const parts: string[] = [d.weatherKind]
  if (d.temperatureC !== null) parts.push(`${d.temperatureC}°C`)
  if (d.cloudCover !== null) parts.push(`${d.cloudCover}% cloud`)
  if (d.precipitationMm !== null) parts.push(`${d.precipitationMm}mm rain`)
  return parts.join(' · ')
}

/**
 * Only what explains the current choice. Raw WMO codes and 14-decimal
 * coordinates were noise: they never changed what anyone would do next.
 */
export function formatDiagnostics(d: Diagnostics): Array<{ label: string; value: string }> {
  return [
    { label: 'Now', value: `${ts(d.now)} · ${place(d)}` },
    // "Phase" is internal jargon; this row is what the app reckons it is.
    { label: 'Vibe', value: `${d.phase} · ${d.season}` },
    { label: 'Daylight', value: d.sunrise && d.sunset ? `${hm(d.sunrise)} → ${hm(d.sunset)}` : '—' },
    { label: 'Weather', value: weather(d) },
    ...(d.issue ? [{ label: 'Issue', value: d.issue }] : []),
  ]
}

/**
 * Decorative wireframe globe. Purely presentational, so it is hidden from
 * assistive tech: it repeats nothing the rows do not already say.
 */
const GLOBE = `
  <div class="globe" aria-hidden="true">
    <svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="50" cy="50" r="46" />
      <line x1="4" y1="50" x2="96" y2="50" />
      <ellipse cx="50" cy="50" rx="46" ry="17" />
      <ellipse cx="50" cy="50" rx="46" ry="33" />
      <line x1="50" y1="4" x2="50" y2="96" />
      <ellipse cx="50" cy="50" rx="17" ry="46" />
      <ellipse cx="50" cy="50" rx="33" ry="46" />
    </svg>
  </div>`

export function buildDiagnostics(root: HTMLElement): { update(d: Diagnostics): void } {
  return {
    update(d: Diagnostics) {
      root.innerHTML =
        GLOBE +
        '<dl class="diagnostics">' +
        formatDiagnostics(d)
          .map((r) => `<dt>${r.label}</dt><dd>${r.value}</dd>`)
          .join('') +
        '</dl>'
    },
  }
}
