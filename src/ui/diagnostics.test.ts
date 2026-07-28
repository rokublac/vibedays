import { describe, it, expect } from 'vitest'
import { formatDiagnostics, buildDiagnostics, type Diagnostics } from './diagnostics'

const full: Diagnostics = {
  issue: null,
  sunrise: null,
  sunset: null,
  cloudCover: null,
  precipitationMm: null,
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
    expect(map['Now']).toContain('21 July 2026 · 01:58')
    expect(map['Vibe']).toBe('deep-night · winter')
    expect(map['Now']).toContain('Sydney, New South Wales, AU')
    expect(map['Weather']).toContain('clear')
  })
  it('uses — fallbacks when data is missing', () => {
    const rows = formatDiagnostics({
      ...full, source: 'none', coords: null, place: null,
      weatherCode: null, weatherKind: null, temperatureC: null,
    })
    const map = Object.fromEntries(rows.map((r) => [r.label, r.value]))
    expect(map['Now']).toContain('unavailable')
    expect(map['Weather']).toBe('—')
  })
})

describe('globe', () => {
  const render = () => {
    const root = document.createElement('div')
    buildDiagnostics(root).update(full)
    return root
  }

  it('sits beside the rows as the first column', () => {
    const root = render()
    expect(root.children[0].classList.contains('globe')).toBe(true)
    expect(root.children[1].classList.contains('diagnostics')).toBe(true)
  })

  it('is hidden from assistive tech, being purely decorative', () => {
    expect(render().querySelector('.globe')!.getAttribute('aria-hidden')).toBe('true')
  })

  it('draws the wireframe rather than loading an image', () => {
    const svg = render().querySelector('.globe svg')!
    expect(svg.getAttribute('viewBox')).toBe('0 0 100 100')
    expect(svg.querySelectorAll('ellipse').length).toBeGreaterThan(0)
    expect(svg.getAttribute('stroke')).toBe('currentColor')
  })

  it('is redrawn on every update rather than accumulating', () => {
    const root = document.createElement('div')
    const panel = buildDiagnostics(root)
    panel.update(full)
    panel.update(full)
    expect(root.querySelectorAll('.globe')).toHaveLength(1)
  })
})

describe('buildDiagnostics', () => {
  it('renders label/value rows into the root', () => {
    const root = document.createElement('div')
    const panel = buildDiagnostics(root)
    panel.update(full)
    expect(root.textContent).toContain('Now')
    expect(root.textContent).toContain('21 July 2026')
    expect(root.textContent).toContain('clear')
  })
})

describe('formatDiagnostics trimming', () => {
  it('shows the place name instead of raw coordinates', () => {
    const map = Object.fromEntries(formatDiagnostics(full).map((r) => [r.label, r.value]))
    // 14-decimal coordinates were noise; they never changed what anyone did next.
    expect(map['Now']).not.toContain('151.2093')
    expect(map['Now']).toContain('Sydney')
  })

  it('falls back to rounded coordinates when there is no place name', () => {
    const map = Object.fromEntries(
      formatDiagnostics({ ...full, place: null }).map((r) => [r.label, r.value]),
    )
    expect(map['Now']).toContain('-33.87, 151.21')
  })

  it('does not surface the playlist pool size', () => {
    const labels = formatDiagnostics(full).map((r) => r.label)
    expect(labels).not.toContain('Playlists')
    expect(labels).not.toContain('Matches')
  })

  it('shows a playback failure on screen, since a phone has no console', () => {
    const map = Object.fromEntries(
      formatDiagnostics({ ...full, issue: 'profile: 403 forbidden' }).map((r) => [r.label, r.value]),
    )
    expect(map['Issue']).toBe('profile: 403 forbidden')
  })

  it('omits the row entirely when nothing has failed', () => {
    expect(formatDiagnostics(full).map((r) => r.label)).not.toContain('Issue')
  })

  it('does not surface the raw search query', () => {
    const labels = formatDiagnostics(full).map((r) => r.label)
    expect(labels).not.toContain('Query')
    expect(labels).not.toContain('Search')
  })

  it('shows only the four human-readable rows', () => {
    expect(formatDiagnostics(full).map((r) => r.label))
      .toEqual(['Now', 'Vibe', 'Daylight', 'Weather'])
  })
})
