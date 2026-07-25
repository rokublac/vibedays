import { describe, it, expect, vi } from 'vitest'
import { playPlaylist, fetchTrackCount, randomStart, setShuffle } from './playback-api'

const ok = (body: unknown = {}) => ({ ok: true, status: 200, json: async () => body })
const bad = (status: number) => ({ ok: false, status, json: async () => ({}) })

describe('playPlaylist', () => {
  it('PUTs the playlist context_uri to the device', async () => {
    const fetchFn = vi.fn().mockResolvedValue(ok()) as unknown as typeof fetch
    await playPlaylist('TOKEN', 'DEV', 'PL', fetchFn)
    const [url, init] = (fetchFn as never as { mock: { calls: [string, RequestInit][] } })
      .mock.calls[0]
    expect(url).toBe('https://api.spotify.com/v1/me/player/play?device_id=DEV')
    expect(init.method).toBe('PUT')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer TOKEN')
    expect(JSON.parse(init.body as string)).toEqual({ context_uri: 'spotify:playlist:PL' })
  })

  it('starts at the given position instead of track one', async () => {
    const fetchFn = vi.fn().mockResolvedValue(ok()) as unknown as typeof fetch
    await playPlaylist('T', 'DEV', 'PL', fetchFn, 17)
    const init = (fetchFn as never as { mock: { calls: [string, RequestInit][] } })
      .mock.calls[0][1]
    expect(JSON.parse(init.body as string).offset).toEqual({ position: 17 })
  })

  it('omits the offset for position zero or none, keeping the request minimal', async () => {
    for (const position of [undefined, 0]) {
      const fetchFn = vi.fn().mockResolvedValue(ok()) as unknown as typeof fetch
      await playPlaylist('T', 'DEV', 'PL', fetchFn, position)
      const init = (fetchFn as never as { mock: { calls: [string, RequestInit][] } })
        .mock.calls[0][1]
      expect(JSON.parse(init.body as string).offset).toBeUndefined()
    }
  })

  it('throws on non-ok', async () => {
    const fetchFn = vi.fn().mockResolvedValue(bad(404)) as unknown as typeof fetch
    await expect(playPlaylist('T', 'D', 'P', fetchFn)).rejects.toThrow()
  })
})

describe('randomStart', () => {
  it('picks somewhere inside the playlist', () => {
    expect(randomStart(100, () => 0)).toBe(0)
    expect(randomStart(100, () => 0.5)).toBe(50)
  })

  it('never returns an index at or past the end', () => {
    // offset.position must stay below total or Spotify rejects the request.
    expect(randomStart(100, () => 1)).toBe(99)
    expect(randomStart(100, () => 0.999999)).toBeLessThan(100)
  })

  it('has nothing to choose for a single-track or unknown playlist', () => {
    expect(randomStart(1, () => 0.9)).toBeUndefined()
    expect(randomStart(0, () => 0.9)).toBeUndefined()
    expect(randomStart(null, () => 0.9)).toBeUndefined()
  })

  it('spreads across the playlist rather than clustering at the start', () => {
    const seen = new Set<number | undefined>()
    for (let i = 0; i < 20; i++) seen.add(randomStart(50, () => i / 20))
    expect(seen.size).toBeGreaterThan(10)
  })
})

describe('fetchTrackCount', () => {
  it('asks only for the total, not the whole playlist', async () => {
    const fetchFn = vi.fn().mockResolvedValue(ok({ tracks: { total: 240 } })) as unknown as typeof fetch
    expect(await fetchTrackCount('T', 'PL', fetchFn)).toBe(240)
    const url = (fetchFn as never as { mock: { calls: [string][] } }).mock.calls[0][0]
    expect(url).toContain('fields=tracks(total)')
  })

  it('is null when the playlist is unreadable, so playback still starts', async () => {
    const fetchFn = vi.fn().mockResolvedValue(bad(404)) as unknown as typeof fetch
    expect(await fetchTrackCount('T', 'PL', fetchFn)).toBeNull()
  })

  it('is null on a malformed or empty response', async () => {
    const empty = vi.fn().mockResolvedValue(ok({})) as unknown as typeof fetch
    expect(await fetchTrackCount('T', 'PL', empty)).toBeNull()
    const zero = vi.fn().mockResolvedValue(ok({ tracks: { total: 0 } })) as unknown as typeof fetch
    expect(await fetchTrackCount('T', 'PL', zero)).toBeNull()
  })

  it('is null rather than throwing when the request errors', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch
    await expect(fetchTrackCount('T', 'PL', fetchFn)).resolves.toBeNull()
  })
})

describe('setShuffle', () => {
  it('turns shuffle on for the device', async () => {
    const fetchFn = vi.fn().mockResolvedValue(ok()) as unknown as typeof fetch
    expect(await setShuffle('T', 'DEV', true, fetchFn)).toBe(true)
    const [url, init] = (fetchFn as never as { mock: { calls: [string, RequestInit][] } })
      .mock.calls[0]
    expect(url).toContain('/me/player/shuffle')
    expect(url).toContain('state=true')
    expect(url).toContain('device_id=DEV')
    expect(init.method).toBe('PUT')
  })

  it('reports failure without throwing, so a good play is not lost', async () => {
    // Shuffle needs an active device and can legitimately 403; playback is fine.
    const denied = vi.fn().mockResolvedValue(bad(403)) as unknown as typeof fetch
    expect(await setShuffle('T', 'DEV', true, denied)).toBe(false)
    const threw = vi.fn().mockRejectedValue(new Error('x')) as unknown as typeof fetch
    expect(await setShuffle('T', 'DEV', true, threw)).toBe(false)
  })
})
