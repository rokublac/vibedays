import type { SunPhase, Season, WeatherKind, Coords } from '../types'

export interface Diagnostics {
  now: Date
  phase: SunPhase
  sunrise: Date | null
  sunset: Date | null
  cloudCover: number | null
  precipitationMm: number | null
  query: string | null
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

function ts(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

export function formatDiagnostics(d: Diagnostics): Array<{ label: string; value: string }> {
  const location =
    d.coords === null
      ? `${d.source} · —`
      : `${d.source} · lat ${d.coords.latitude}, lon ${d.coords.longitude}` +
        (d.place ? ` · ${d.place}` : '')

  const weather =
    d.weatherCode === null
      ? '—'
      : `code ${d.weatherCode} (${d.weatherKind})` +
        (d.temperatureC === null ? '' : ` · ${d.temperatureC}°C`) +
        (d.cloudCover === null ? '' : ` · ${d.cloudCover}% cloud`) +
        (d.precipitationMm === null ? '' : ` · ${d.precipitationMm}mm`)

  return [
    { label: 'Local time', value: ts(d.now) },
    { label: 'Phase', value: `${d.phase} · ${d.season}` },
    { label: 'Sun', value: d.sunrise && d.sunset ? `${hm(d.sunrise)} → ${hm(d.sunset)}` : '—' },
    { label: 'Location', value: location },
    { label: 'Weather', value: weather },
    { label: 'Query', value: d.query ?? '—' },
  ]
}

export function buildDiagnostics(root: HTMLElement): { update(d: Diagnostics): void } {
  return {
    update(d: Diagnostics) {
      root.innerHTML =
        '<dl class="diagnostics">' +
        formatDiagnostics(d)
          .map((r) => `<dt>${r.label}</dt><dd>${r.value}</dd>`)
          .join('') +
        '</dl>'
    },
  }
}
