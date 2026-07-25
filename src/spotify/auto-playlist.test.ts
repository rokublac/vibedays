import { describe, it, expect, vi } from 'vitest'
import { createAutoPlaylists, chooseFrom, CANDIDATE_POOL, MIN_RESULTS } from './auto-playlist'
import type { SpotifyPlaylist } from './search-api'
import type { Conditions } from '../types'

const list = (n: number): SpotifyPlaylist[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Playlist ${i}`, owner: 'u' }))

const cond = (over: Partial<Conditions> = {}): Conditions => ({
  phase: 'sunset-golden',
  season: 'winter',
  weather: 'clear',
  cloud: 'clear',
  precip: 'none',
  temp: 'cold',
  ...over,
})

describe('chooseFrom', () => {
  it('picks from the top candidates only', () => {
    expect(chooseFrom(list(20), () => 0.99)!.id).toBe(`p${CANDIDATE_POOL - 1}`)
    expect(chooseFrom(list(20), () => 0)!.id).toBe('p0')
  })
  it('never overruns on a random of exactly 1', () => {
    expect(chooseFrom(list(20), () => 1)!.id).toBe(`p${CANDIDATE_POOL - 1}`)
  })
  it('is null for no results', () => {
    expect(chooseFrom([], () => 0)).toBeNull()
  })
})

describe('createAutoPlaylists query ladder', () => {
  it('stops at the first rung with enough results', async () => {
    const search = vi.fn(async () => list(MIN_RESULTS))
    await createAutoPlaylists({ search, random: () => 0 }).resolve(cond())
    expect(search).toHaveBeenCalledTimes(1)
  })

  it('broadens when a specific query is too narrow', async () => {
    const search = vi.fn(async (_q: string): Promise<SpotifyPlaylist[]> => [])
      .mockResolvedValueOnce([])            // most specific
      .mockResolvedValueOnce(list(1))       // still thin
      .mockResolvedValueOnce(list(8))       // broad enough
    const auto = createAutoPlaylists({ search, random: () => 0 })

    expect((await auto.resolve(cond()))!.id).toBe('p0')
    expect(search).toHaveBeenCalledTimes(3)

    // Each rung is broader than the last.
    const queries = search.mock.calls.map((c) => c[0])
    for (let i = 1; i < queries.length; i++) {
      expect(queries[i].length).toBeLessThan(queries[i - 1].length)
    }
  })

  it('anchors every rung on lofi', async () => {
    const search = vi.fn(async (_q: string): Promise<SpotifyPlaylist[]> => [])
    await createAutoPlaylists({ search, random: () => 0 }).resolve(cond())
    for (const call of search.mock.calls) expect(call[0]).toContain('lofi')
  })

  it('falls back to the best rung seen when none had enough', async () => {
    const search = vi.fn()
      .mockResolvedValueOnce(list(2))  // thin, but the best we ever see
      .mockResolvedValue([])           // everything broader is empty
    const auto = createAutoPlaylists({ search, random: () => 0 })
    expect((await auto.resolve(cond()))!.id).toBe('p0')
  })

  it('is null when nothing anywhere on the ladder matched', async () => {
    const search = vi.fn(async () => [])
    expect(await createAutoPlaylists({ search, random: () => 0 }).resolve(cond())).toBeNull()
  })
})

describe('createAutoPlaylists pinning', () => {
  it('pins per exact condition signature', async () => {
    const search = vi.fn(async () => list(8))
    let n = 0
    const auto = createAutoPlaylists({ search, random: () => [0, 0.5, 0.9][n++ % 3] })

    const cold = await auto.resolve(cond({ temp: 'cold' }))
    await auto.resolve(cond({ temp: 'warm' }))
    const coldAgain = await auto.resolve(cond({ temp: 'cold' }))

    expect(coldAgain!.id).toBe(cold!.id)
    expect(search).toHaveBeenCalledTimes(2) // one walk each, not three
  })

  it('treats a different phase as a different pin', async () => {
    const search = vi.fn(async () => list(8))
    const auto = createAutoPlaylists({ search, random: () => 0 })
    await auto.resolve(cond({ phase: 'midday' }))
    await auto.resolve(cond({ phase: 'deep-night' }))
    expect(search).toHaveBeenCalledTimes(2)
  })

  it('shares an in-flight walk instead of firing one per render tick', async () => {
    const search = vi.fn(async () => list(8))
    const auto = createAutoPlaylists({ search, random: () => 0 })
    const c = cond()
    await Promise.all([auto.resolve(c), auto.resolve(c), auto.resolve(c)])
    expect(search).toHaveBeenCalledTimes(1)
  })

  it('leaves a failed walk retryable', async () => {
    const search = vi.fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue(list(8))
    const auto = createAutoPlaylists({ search, random: () => 0 })

    await expect(auto.resolve(cond())).rejects.toThrow('network')
    expect((await auto.resolve(cond()))!.id).toBe('p0')
  })

  it('reports the rung it used', async () => {
    const onQuery = vi.fn()
    const search = vi.fn(async () => list(8))
    await createAutoPlaylists({ search, random: () => 0, onQuery }).resolve(cond())
    expect(onQuery).toHaveBeenCalledWith(expect.stringContaining('lofi'), 8)
  })
})

describe('createAutoPlaylists contradiction filtering', () => {
  const named = (...names: string[]): SpotifyPlaylist[] =>
    names.map((name) => ({ id: name, name, owner: 'u' }))

  it('will not pick a rain playlist on a clear night', async () => {
    const search = vi.fn(async () =>
      named('lofi sleep, lofi rain', 'deep night lofi', 'quiet winter nights', 'night tape'))
    const auto = createAutoPlaylists({ search, random: () => 0 })
    const pick = await auto.resolve(cond({ phase: 'deep-night', precip: 'none' }))
    expect(pick!.name).not.toContain('rain')
  })

  it('counts only non-contradicting results toward the threshold', async () => {
    const search = vi.fn()
      .mockResolvedValueOnce(named('lofi rain', 'lofi snow', 'summer lofi')) // all wrong
      .mockResolvedValueOnce(named('night one', 'night two', 'night three'))  // all fine
    const auto = createAutoPlaylists({ search, random: () => 0 })
    const pick = await auto.resolve(cond({ phase: 'deep-night', precip: 'none' }))

    expect(search).toHaveBeenCalledTimes(2) // the first rung did not satisfy it
    expect(pick!.name).toBe('night one')
  })

  it('falls back to a contradicting result rather than playing nothing', async () => {
    const search = vi.fn(async () => named('lofi rain'))
    const auto = createAutoPlaylists({ search, random: () => 0 })
    expect((await auto.resolve(cond({ precip: 'none' })))!.name).toBe('lofi rain')
  })

  it('still allows rain when it is raining', async () => {
    const search = vi.fn(async () => named('lofi rain', 'rainy day lofi', 'wet streets lofi'))
    const auto = createAutoPlaylists({ search, random: () => 0 })
    expect((await auto.resolve(cond({ precip: 'steady' })))!.name).toBe('lofi rain')
  })
})
