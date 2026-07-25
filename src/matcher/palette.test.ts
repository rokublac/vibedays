import { describe, it, expect } from 'vitest'
import { particlesFor, derivePalette } from './palette'
import { PHASES } from '../conditions/descriptors'

// WCAG 2.1 relative luminance / contrast, so the palette can assert its own accessibility.
function channels(hex: string): [number, number, number] {
  const v = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  return [v[0], v[1], v[2]]
}
function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}
// Vertical gradient midpoint — text can sit anywhere down the screen.
function midpoint(a: string, b: string): string {
  const [ar, ag, ab] = channels(a)
  const [br, bg, bb] = channels(b)
  const hex = (x: number, y: number) =>
    Math.round(((x + y) / 2) * 255).toString(16).padStart(2, '0')
  return `#${hex(ar, br)}${hex(ag, bg)}${hex(ab, bb)}`
}
// What a semi-transparent foreground actually resolves to once composited.
function composite(fg: string, alpha: number, bg: string): string {
  const f = channels(fg)
  const b = channels(bg)
  const hex = (i: number) =>
    Math.round((f[i] * alpha + b[i] * (1 - alpha)) * 255).toString(16).padStart(2, '0')
  return `#${hex(0)}${hex(1)}${hex(2)}`
}

// Mirrors --fg-muted in style.css. Secondary text is still body text, so it
// must clear 4.5:1 too — dimming it is what broke the evening gradient before.
const MUTED_ALPHA = 0.85

/** Peak alpha of the backdrop's light pools; they lighten what sits under them. */
const WASH_ALPHA = 0.1

describe('particlesFor', () => {
  it('rain/storm → rain', () => {
    expect(particlesFor('rain')).toBe('rain')
    expect(particlesFor('storm')).toBe('rain')
  })
  it('snow → snow', () => expect(particlesFor('snow')).toBe('snow'))
  it('clear/null → motes', () => {
    expect(particlesFor('clear')).toBe('motes')
    expect(particlesFor(null)).toBe('motes')
  })
})

describe('derivePalette', () => {
  it('darkens across the night phases as the routine winds down', () => {
    const lum = (hex: string) => luminance(hex)
    const evening = derivePalette('evening', 'clear', 'winter').gradient[0]
    const deep = derivePalette('deep-night', 'clear', 'winter').gradient[0]
    const late = derivePalette('late-night', 'clear', 'winter').gradient[0]
    expect(lum(evening)).toBeGreaterThan(lum(deep))
    expect(lum(deep)).toBeGreaterThan(lum(late))
  })
  it('carries weather particles and season accent', () => {
    const p = derivePalette('afternoon', 'rain', 'autumn')
    expect(p.particles).toBe('rain')
    expect(p.accent).toBe('#e07a5f')
  })

  it('covers every phase', () => {
    for (const phase of PHASES) expect(derivePalette(phase, 'clear', 'spring').gradient).toBeTruthy()
  })

  it('uses dark text on the light daytime gradients and light text at night', () => {
    expect(derivePalette('morning', 'clear', 'spring').fg).toBe('#1a1a2e')
    expect(derivePalette('afternoon', 'clear', 'spring').fg).toBe('#1a1a2e')
    expect(derivePalette('late-night', 'clear', 'spring').fg).toBe('#f5f5f5')
  })
})

describe('palette contrast (WCAG 2.1 AA, 4.5:1 for body text)', () => {
  const TIMES = PHASES

  it.each(TIMES)('%s text clears 4.5:1 at the top, middle and bottom of the gradient', (time) => {
    const { fg, gradient } = derivePalette(time, 'clear', 'spring')
    const [top, bottom] = gradient
    for (const bg of [top, midpoint(top, bottom), bottom]) {
      expect(contrast(fg, bg)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it.each(TIMES)('%s muted secondary text still clears 4.5:1 across the gradient', (time) => {
    const { fg, gradient } = derivePalette(time, 'clear', 'spring')
    const [top, bottom] = gradient
    for (const bg of [top, midpoint(top, bottom), bottom]) {
      expect(contrast(composite(fg, MUTED_ALPHA, bg), bg)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it.each(TIMES)('%s play button boundary is discernible against the backdrop', (time) => {
    // WCAG 1.4.11 wants the *boundary* to read against what surrounds it, which
    // the --fg ring gives at every time of day. It deliberately does NOT test
    // ring-vs-fill: at night both are light and the ring melts into the accent,
    // which is fine — the circle already carries 9:1+ against a dark gradient.
    const { fg, gradient } = derivePalette(time, 'clear', 'spring')
    for (const stop of gradient) {
      expect(contrast(fg, stop)).toBeGreaterThanOrEqual(3)
    }
  })

  it.each(TIMES)('%s track link stays AA on its tinted surface', (time) => {
    // .track-link paints --fg over the gradient at 10% (rest) / 16% (hover),
    // which pulls the surface toward the text and eats contrast. Track name and
    // artist are full-strength --fg; the ↗ is an icon, so it only owes 3:1.
    const { fg, gradient } = derivePalette(time, 'clear', 'spring')
    const [top, bottom] = gradient
    for (const bg of [top, midpoint(top, bottom), bottom]) {
      for (const tint of [0.1, 0.16]) {
        const surface = composite(fg, tint, bg)
        expect(contrast(fg, surface)).toBeGreaterThanOrEqual(4.5)
        expect(contrast(composite(fg, MUTED_ALPHA, surface), surface)).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('play/pause glyph reads against every seasonal fill', () => {
    // Mirrors --on-accent in style.css.
    const ON_ACCENT = '#14141f'
    for (const season of ['spring', 'summer', 'autumn', 'winter'] as const) {
      const { accent } = derivePalette('afternoon', 'clear', season)
      expect(contrast(ON_ACCENT, accent)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('primary button text reads when knocked out of the --fg fill', () => {
    // .btn-primary is --fg filled with --grad-bottom text, so its ratio is the
    // same bottom-stop figure the body text already clears.
    for (const time of TIMES) {
      const { fg, gradient } = derivePalette(time, 'clear', 'spring')
      expect(contrast(fg, gradient[1])).toBeGreaterThanOrEqual(4.5)
    }
  })

  it.each(TIMES)('%s text survives the backdrop light pools', (time) => {
    // The decorative pools lighten the gradient. Text sitting on one must still
    // clear AA, including the muted tier, which is what forced 85% over 75%.
    const { fg, gradient } = derivePalette(time, 'clear', 'spring')
    const [top, bottom] = gradient
    for (const bg of [top, midpoint(top, bottom), bottom]) {
      const washed = composite('#ffffff', WASH_ALPHA, bg)
      expect(contrast(fg, washed)).toBeGreaterThanOrEqual(4.5)
      expect(contrast(composite(fg, MUTED_ALPHA, washed), washed)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('scores the known-worst case (white on the afternoon bottom stop) as a failure', () => {
    // Guards the helper itself: this is the 1.07:1 bug the fg token exists to prevent.
    expect(contrast('#f5f5f5', '#dfefff')).toBeLessThan(1.5)
  })
})
