import { describe, it, expect, vi } from 'vitest'
import { geocodeCity, reverseGeocode } from './location'

describe('geocodeCity', () => {
  it('returns coords for the first result', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ latitude: 51.5, longitude: -0.12, name: 'London' }] }),
    }) as unknown as typeof fetch
    const coords = await geocodeCity('London', fakeFetch)
    expect(coords).toEqual({ latitude: 51.5, longitude: -0.12 })
    expect((fakeFetch as any).mock.calls[0][0]).toContain('name=London')
  })
  it('throws when no results', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [] }),
    }) as unknown as typeof fetch
    await expect(geocodeCity('Nowhereville', fakeFetch)).rejects.toThrow('city not found')
  })
})

describe('reverseGeocode', () => {
  it('builds "city, subdivision, country" from the response', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ city: 'Sydney', principalSubdivision: 'New South Wales', countryCode: 'AU' }),
    }) as unknown as typeof fetch
    const place = await reverseGeocode({ latitude: -33.8688, longitude: 151.2093 }, fakeFetch)
    expect(place).toBe('Sydney, New South Wales, AU')
    expect((fakeFetch as any).mock.calls[0][0]).toContain('latitude=-33.8688')
  })
  it('falls back to locality and omits missing fields', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ city: '', locality: 'Newtown', principalSubdivision: '', countryCode: 'AU' }),
    }) as unknown as typeof fetch
    expect(await reverseGeocode({ latitude: 0, longitude: 0 }, fakeFetch)).toBe('Newtown, AU')
  })
  it('throws on non-ok', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch
    await expect(reverseGeocode({ latitude: 0, longitude: 0 }, fakeFetch)).rejects.toThrow()
  })
})
