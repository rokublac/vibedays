import { describe, it, expect, beforeEach } from 'vitest'
import {
  DEFAULT_VOLUME,
  clampLevel,
  effective,
  loadVolume,
  saveVolume,
} from './volume'

describe('clampLevel', () => {
  it('keeps a level inside 0..1', () => {
    expect(clampLevel(0.42)).toBe(0.42)
    expect(clampLevel(0)).toBe(0)
    expect(clampLevel(1)).toBe(1)
  })

  it('clamps out-of-range levels rather than passing them to the SDK', () => {
    expect(clampLevel(-0.5)).toBe(0)
    expect(clampLevel(1.5)).toBe(1)
  })

  it('falls back to the default for values that are not numbers', () => {
    expect(clampLevel(NaN)).toBe(DEFAULT_VOLUME)
    expect(clampLevel(Infinity)).toBe(DEFAULT_VOLUME)
  })
})

describe('effective', () => {
  it('is the level when unmuted', () => {
    expect(effective({ level: 0.4, muted: false })).toBe(0.4)
  })

  it('is silent when muted, without losing the level', () => {
    expect(effective({ level: 0.4, muted: true })).toBe(0)
  })
})

describe('stored volume', () => {
  beforeEach(() => localStorage.clear())

  it('round-trips a state', () => {
    saveVolume({ level: 0.25, muted: true })
    expect(loadVolume()).toEqual({ level: 0.25, muted: true })
  })

  it('defaults when nothing is saved', () => {
    expect(loadVolume()).toEqual({ level: DEFAULT_VOLUME, muted: false })
  })

  it('defaults rather than throwing on junk', () => {
    // A bad stored value must never be able to silence playback permanently.
    for (const bad of [
      'not json',
      '[]',
      'null',
      '{"level":"loud"}',
      '{"level":null,"muted":false}',
    ]) {
      localStorage.setItem('hb_volume', bad)
      expect(loadVolume()).toEqual({ level: DEFAULT_VOLUME, muted: false })
    }
  })

  it('clamps a stored level that is out of range', () => {
    localStorage.setItem('hb_volume', JSON.stringify({ level: 9, muted: false }))
    expect(loadVolume()).toEqual({ level: 1, muted: false })
  })

  it('treats a missing muted flag as unmuted', () => {
    localStorage.setItem('hb_volume', JSON.stringify({ level: 0.3 }))
    expect(loadVolume()).toEqual({ level: 0.3, muted: false })
  })
})
