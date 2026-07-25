import { describe, it, expect, beforeEach } from 'vitest'
import { loadPlace, savePlace, clearPlace } from './place'

const SYDNEY = { name: 'Sydney', coords: { latitude: -33.87, longitude: 151.21 } }

describe('saved place', () => {
  beforeEach(() => localStorage.clear())

  it('round-trips a city', () => {
    savePlace(SYDNEY)
    expect(loadPlace()).toEqual(SYDNEY)
  })

  it('is null when nothing is saved', () => {
    expect(loadPlace()).toBeNull()
  })

  it('can be cleared', () => {
    savePlace(SYDNEY)
    clearPlace()
    expect(loadPlace()).toBeNull()
  })

  it('rejects junk rather than feeding it into the conditions engine', () => {
    for (const bad of [
      'not json',
      '{}',
      '{"name":"x"}',
      '{"name":"","coords":{"latitude":1,"longitude":2}}',
      '{"name":"x","coords":{"latitude":"1","longitude":2}}',
      '{"name":"x","coords":{"latitude":null,"longitude":2}}',
    ]) {
      localStorage.setItem('hb_place', bad)
      expect(loadPlace()).toBeNull()
    }
  })

  it('rejects impossible coordinates', () => {
    // A bad latitude would silently flip the hemisphere, and so the season.
    localStorage.setItem('hb_place', JSON.stringify({ name: 'x', coords: { latitude: 91, longitude: 0 } }))
    expect(loadPlace()).toBeNull()
    localStorage.setItem('hb_place', JSON.stringify({ name: 'x', coords: { latitude: 0, longitude: 181 } }))
    expect(loadPlace()).toBeNull()
  })
})
