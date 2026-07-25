import { describe, it, expect } from 'vitest'
import { formatDiagnostics, buildDiagnostics, type Diagnostics } from './diagnostics'

const full: Diagnostics = {
  sunrise: null,
  sunset: null,
  cloudCover: null,
  precipitationMm: null,
  query: null,
  now: new Date(2026, 6, 21, 1, 58, 42),
  phase: 'deep-night',
  season: 'winter',
  source: 'geolocation',
  coords: { latitude: -33.8688, longitude: 151.2093 },
  place: 'Sydney, New South Wales, AU',
  weatherCode: 0,
  weatherKind: 'clear',
  temperatureC: 12.3,
}

describe('formatDiagnostics', () => {
  it('formats all rows', () => {
    const rows = formatDiagnostics(full)
    const map = Object.fromEntries(rows.map((r) => [r.label, r.value]))
    expect(map['Local time']).toBe('2026-07-21 01:58:42')
    expect(map['Phase']).toBe('deep-night · winter')
    expect(map['Location']).toBe('geolocation · lat -33.8688, lon 151.2093 · Sydney, New South Wales, AU')
    expect(map['Weather']).toBe('code 0 (clear) · 12.3°C')
  })
  it('uses — fallbacks when data is missing', () => {
    const rows = formatDiagnostics({
      ...full, source: 'none', coords: null, place: null,
      weatherCode: null, weatherKind: null, temperatureC: null,
    })
    const map = Object.fromEntries(rows.map((r) => [r.label, r.value]))
    expect(map['Location']).toBe('none · —')
    expect(map['Weather']).toBe('—')
  })
})

describe('buildDiagnostics', () => {
  it('renders label/value rows into the root', () => {
    const root = document.createElement('div')
    const panel = buildDiagnostics(root)
    panel.update(full)
    expect(root.textContent).toContain('Local time')
    expect(root.textContent).toContain('2026-07-21 01:58:42')
    expect(root.textContent).toContain('code 0 (clear) · 12.3°C')
  })
})
