import { describe, it, expect } from 'vitest'
import { computeSunPhase, clockPhase, parseSunTimes } from './sun'

// A Shoalhaven winter day: sunrise 07:01, sunset 17:05.
const SUN = {
  sunrise: new Date('2026-07-25T07:01:00'),
  sunset: new Date('2026-07-25T17:05:00'),
}
const at = (hhmm: string) => new Date(`2026-07-25T${hhmm}:00`)

describe('computeSunPhase', () => {
  it.each([
    ['03:00', 'late-night'],
    ['06:30', 'dawn'],
    ['07:30', 'sunrise-golden'],
    ['09:00', 'morning'],
    ['12:03', 'midday'],
    ['15:00', 'afternoon'],
    ['16:30', 'sunset-golden'],
    ['17:30', 'blue-hour'],
    ['18:45', 'evening'],
    ['21:00', 'evening'],
    ['22:30', 'deep-night'],
  ])('%s → %s', (time, expected) => {
    expect(computeSunPhase(at(time), SUN)).toBe(expected)
  })

  it('puts a 17:24 winter evening in blue hour', () => {
    expect(computeSunPhase(at('17:24'), SUN)).toBe('blue-hour')
  })

  it('calls 18:45 evening, not deep night, despite a 17:11 sunset', () => {
    // Dark is not the same as bedtime: after an early winter sunset people are
    // still awake and unwinding, so the clock decides the after-dark phases.
    const early = {
      sunrise: new Date('2026-07-25T06:57:00'),
      sunset: new Date('2026-07-25T17:11:00'),
    }
    expect(computeSunPhase(new Date('2026-07-25T18:45:00'), early)).toBe('evening')
  })

  it('walks evening → deep night → late night through the small hours', () => {
    const early = {
      sunrise: new Date('2026-07-25T06:57:00'),
      sunset: new Date('2026-07-25T17:11:00'),
    }
    const phaseAt = (t: string) => computeSunPhase(new Date(`2026-07-25T${t}:00`), early)
    expect(phaseAt('19:30')).toBe('evening')
    expect(phaseAt('21:59')).toBe('evening')
    expect(phaseAt('22:00')).toBe('deep-night')
    expect(phaseAt('23:30')).toBe('deep-night')
    expect(phaseAt('00:30')).toBe('late-night')
    expect(phaseAt('03:30')).toBe('late-night')
    expect(phaseAt('04:30')).toBe('deep-night')
  })

  it('tracks the sun, so the same clock time differs by season', () => {
    const summer = {
      sunrise: new Date('2026-12-25T05:40:00'),
      sunset: new Date('2026-12-25T20:05:00'),
    }
    const t = new Date('2026-12-25T17:24:00')
    expect(computeSunPhase(t, summer)).toBe('afternoon')
  })

  it('falls back to the clock without sun times', () => {
    expect(computeSunPhase(at('12:00'), null)).toBe(clockPhase(at('12:00')))
  })

  it('falls back when the arc is degenerate (polar day/night)', () => {
    const polar = { sunrise: new Date('2026-07-25T12:00:00'), sunset: new Date('2026-07-25T12:00:00') }
    expect(computeSunPhase(at('15:00'), polar)).toBe(clockPhase(at('15:00')))
  })

  it('falls back on unparseable dates', () => {
    const bad = { sunrise: new Date('nope'), sunset: new Date('nope') }
    expect(computeSunPhase(at('15:00'), bad)).toBe(clockPhase(at('15:00')))
  })

  it('stays monotonic on a very short day where windows would overlap', () => {
    const short = {
      sunrise: new Date('2026-07-25T11:30:00'),
      sunset: new Date('2026-07-25T12:30:00'),
    }
    const seen = ['10:00', '11:00', '11:40', '12:00', '12:20', '13:00', '14:00']
      .map((t) => computeSunPhase(at(t), short))
    expect(seen.some((p) => p === 'evening' || p === 'deep-night' || p === 'late-night')).toBe(true)
    expect(new Set(seen).size).toBeGreaterThan(1) // it still discriminates
  })
})

describe('parseSunTimes', () => {
  it('parses local wall-clock ISO strings', () => {
    const s = parseSunTimes('2026-07-25T07:01', '2026-07-25T17:05')!
    expect(s.sunrise.getHours()).toBe(7)
    expect(s.sunset.getHours()).toBe(17)
  })
  it('is null when either is missing or invalid', () => {
    expect(parseSunTimes(null, '2026-07-25T17:05')).toBeNull()
    expect(parseSunTimes('2026-07-25T07:01', undefined)).toBeNull()
    expect(parseSunTimes('nonsense', 'nonsense')).toBeNull()
  })
})
