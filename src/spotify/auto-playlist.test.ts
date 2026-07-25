import { describe, it, expect, vi } from 'vitest'
import {
  createAutoPlaylists, chooseFrom, CANDIDATE_POOL, MIN_RESULTS, EXTRA_PAGES, PAGE_SIZE,
} from './auto-playlist'
import type { SpotifyPlaylist } from './search-api'
import type { Conditions } from '../types'
import { genreById } from '../config/genres'

const LOFI = genreById('lofi')
const genre = () => LOFI

const list = (n: number): SpotifyPlaylist[] =>
  Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `Playlist ${i}`, owner: 'u' }))

/**
 * Ladder rungs are the calls without an offset; anything with one is a widen
 * page for a query that already succeeded.
 */
const rungs = (search: { mock: { calls: unknown[][] } }) =>
  search.mock.calls.filter((c) => !c[1]).length

const cond = (over: Partial<Conditions> = {}): Conditions => ({
  located: true,
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
    await createAutoPlaylists({ genre, search, random: () => 0 }).resolve(cond())
    expect(rungs(search)).toBe(1)
  })

  it('broadens when a specific query is too narrow', async () => {
    const search = vi.fn(async (_q: string, _o?: number): Promise<SpotifyPlaylist[]> => [])
      .mockResolvedValueOnce([])            // most specific
      .mockResolvedValueOnce(list(1))       // still thin
      .mockResolvedValueOnce(list(8))       // broad enough
      .mockResolvedValue([])                // widen pages
    const auto = createAutoPlaylists({ genre, search, random: () => 0 })

    expect((await auto.resolve(cond()))!.id).toBe('p0')
    expect(rungs(search)).toBe(3)

    // Each rung is broader than the last.
    const queries = search.mock.calls.filter((c) => !c[1]).map((c) => c[0])
    for (let i = 1; i < queries.length; i++) {
      expect(queries[i].length).toBeLessThan(queries[i - 1].length)
    }
  })

  it('anchors every rung on lofi', async () => {
    const search = vi.fn(async (_q: string, _o?: number): Promise<SpotifyPlaylist[]> => [])
    await createAutoPlaylists({ genre, search, random: () => 0 }).resolve(cond())
    for (const call of search.mock.calls) expect(call[0]).toContain('lofi')
  })

  it('falls back to the best rung seen when none had enough', async () => {
    const search = vi.fn()
      .mockResolvedValueOnce(list(2))  // thin, but the best we ever see
      .mockResolvedValue([])           // everything broader is empty
    const auto = createAutoPlaylists({ genre, search, random: () => 0 })
    expect((await auto.resolve(cond()))!.id).toBe('p0')
  })

  it('is null when nothing anywhere on the ladder matched', async () => {
    const search = vi.fn(async () => [])
    expect(await createAutoPlaylists({ genre, search, random: () => 0 }).resolve(cond())).toBeNull()
  })
})

describe('createAutoPlaylists pinning', () => {
  it('pins per exact condition signature', async () => {
    const search = vi.fn(async () => list(8))
    let n = 0
    const auto = createAutoPlaylists({ genre, search, random: () => [0, 0.5, 0.9][n++ % 3] })

    const cold = await auto.resolve(cond({ temp: 'cold' }))
    await auto.resolve(cond({ temp: 'warm' }))
    const coldAgain = await auto.resolve(cond({ temp: 'cold' }))

    expect(coldAgain!.id).toBe(cold!.id)
    expect(rungs(search)).toBe(2) // one walk each, not three
  })

  it('treats a different phase as a different pin', async () => {
    const search = vi.fn(async () => list(8))
    const auto = createAutoPlaylists({ genre, search, random: () => 0 })
    await auto.resolve(cond({ phase: 'midday' }))
    await auto.resolve(cond({ phase: 'deep-night' }))
    expect(rungs(search)).toBe(2)
  })

  it('shares an in-flight walk instead of firing one per render tick', async () => {
    const search = vi.fn(async () => list(8))
    const auto = createAutoPlaylists({ genre, search, random: () => 0 })
    const c = cond()
    await Promise.all([auto.resolve(c), auto.resolve(c), auto.resolve(c)])
    expect(rungs(search)).toBe(1)
  })

  it('leaves a failed walk retryable', async () => {
    const search = vi.fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValue(list(8))
    const auto = createAutoPlaylists({ genre, search, random: () => 0 })

    await expect(auto.resolve(cond())).rejects.toThrow('network')
    expect((await auto.resolve(cond()))!.id).toBe('p0')
  })

  it('reports the rung it used', async () => {
    const onQuery = vi.fn()
    const search = vi.fn(async () => list(8))
    await createAutoPlaylists({ genre, search, random: () => 0, onQuery }).resolve(cond())
    expect(onQuery).toHaveBeenCalledWith(expect.stringContaining('lofi'), 8)
  })
})

describe('createAutoPlaylists contradiction filtering', () => {
  const named = (...names: string[]): SpotifyPlaylist[] =>
    names.map((name) => ({ id: name, name, owner: 'u' }))

  it('will not pick a rain playlist on a clear night', async () => {
    const search = vi.fn(async () =>
      named('lofi sleep, lofi rain', 'deep night lofi', 'quiet winter nights', 'night tape'))
    const auto = createAutoPlaylists({ genre, search, random: () => 0 })
    const pick = await auto.resolve(cond({ phase: 'deep-night', precip: 'none' }))
    expect(pick!.name).not.toContain('rain')
  })

  it('counts only non-contradicting results toward the threshold', async () => {
    const search = vi.fn()
      .mockResolvedValueOnce(named('lofi rain', 'lofi snow', 'summer lofi')) // all wrong
      .mockResolvedValueOnce(named('night one', 'night two', 'night three'))  // all fine
      .mockResolvedValue([])                                                  // widen pages
    const auto = createAutoPlaylists({ genre, search, random: () => 0 })
    const pick = await auto.resolve(cond({ phase: 'deep-night', precip: 'none' }))

    expect(rungs(search)).toBe(2) // the first rung did not satisfy it
    expect(pick!.name).toBe('night one')
  })

  it('falls back to a contradicting result rather than playing nothing', async () => {
    const search = vi.fn(async () => named('lofi rain'))
    const auto = createAutoPlaylists({ genre, search, random: () => 0 })
    expect((await auto.resolve(cond({ precip: 'none' })))!.name).toBe('lofi rain')
  })

  it('still allows rain when it is raining', async () => {
    const search = vi.fn(async () => named('lofi rain', 'rainy day lofi', 'wet streets lofi'))
    const auto = createAutoPlaylists({ genre, search, random: () => 0 })
    expect((await auto.resolve(cond({ precip: 'steady' })))!.name).toBe('lofi rain')
  })
})

describe('createAutoPlaylists reroll', () => {
  const list5 = () => list(5)

  it('gives a different playlist for the same conditions', async () => {
    const search = vi.fn(async () => list5())
    const auto = createAutoPlaylists({ genre, search, random: () => 0 })
    const first = await auto.resolve(cond())
    const second = await auto.reroll(cond())
    expect(second!.id).not.toBe(first!.id)
  })

  it('costs no extra search, reusing the pool already fetched', async () => {
    const search = vi.fn(async () => list5())
    const auto = createAutoPlaylists({ genre, search, random: () => 0 })
    await auto.resolve(cond())
    const afterResolve = search.mock.calls.length
    await auto.reroll(cond())
    await auto.reroll(cond())
    expect(search).toHaveBeenCalledTimes(afterResolve) // rerolls hit no network
  })

  it('walks the whole pool then wraps back round', async () => {
    const search = vi.fn(async () => list(3))
    const auto = createAutoPlaylists({ genre, search, random: () => 0 })
    const seen = [await auto.resolve(cond())]
    for (let i = 0; i < 3; i++) seen.push(await auto.reroll(cond()))
    expect(seen.map((p) => p!.id)).toEqual(['p0', 'p1', 'p2', 'p0'])
  })

  it('sticks with what it has when there is only one option', async () => {
    const search = vi.fn(async () => list(1))
    const auto = createAutoPlaylists({ genre, search, random: () => 0 })
    const first = await auto.resolve(cond())
    expect((await auto.reroll(cond()))!.id).toBe(first!.id)
  })

  it('resolves normally when rerolled before anything was picked', async () => {
    const search = vi.fn(async () => list5())
    const auto = createAutoPlaylists({ genre, search, random: () => 0 })
    expect((await auto.reroll(cond()))!.id).toBe('p0')
  })

  it('keeps the new choice pinned, so a render tick does not undo it', async () => {
    const search = vi.fn(async () => list5())
    const auto = createAutoPlaylists({ genre, search, random: () => 0 })
    await auto.resolve(cond())
    const rerolled = await auto.reroll(cond())
    expect((await auto.resolve(cond()))!.id).toBe(rerolled!.id)
  })

  it('rerolls independently per condition signature', async () => {
    const search = vi.fn(async () => list5())
    const auto = createAutoPlaylists({ genre, search, random: () => 0 })
    await auto.resolve(cond({ temp: 'cold' }))
    await auto.resolve(cond({ temp: 'warm' }))
    await auto.reroll(cond({ temp: 'cold' }))
    expect((await auto.resolve(cond({ temp: 'warm' })))!.id).toBe('p0') // untouched
  })

  it('reports how many alternatives exist', async () => {
    const search = vi.fn(async () => list(7))
    const auto = createAutoPlaylists({ genre, search, random: () => 0 })
    expect(auto.poolSize(cond())).toBe(0)
    await auto.resolve(cond())
    expect(auto.poolSize(cond())).toBe(7)
  })
})

describe('createAutoPlaylists widening', () => {
  const page = (prefix: string, n: number): SpotifyPlaylist[] =>
    Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, name: `${prefix} ${i}`, owner: 'u' }))

  it('pages the winning query to get past the 10-result API cap', async () => {
    const search = vi.fn(async (_q: string, offset?: number) => {
      if (!offset) return page('a', 10)
      if (offset === PAGE_SIZE) return page('b', 10)
      return page('c', 10)
    })
    const auto = createAutoPlaylists({ genre, search, random: () => 0 })
    await auto.resolve(cond())
    // 10 per page, EXTRA_PAGES beyond the first.
    expect(auto.poolSize(cond())).toBe(10 * (EXTRA_PAGES + 1))
  })

  it('requests the offsets Spotify expects', async () => {
    const search = vi.fn(async (_q: string, _o?: number) => list(10))
    await createAutoPlaylists({ genre, search, random: () => 0 }).resolve(cond())
    const offsets = search.mock.calls.map((c) => c[1])
    expect(offsets).toContain(PAGE_SIZE)
    expect(offsets).toContain(PAGE_SIZE * 2)
  })

  it('only pages the rung that won, not every rung', async () => {
    const search = vi.fn()
      .mockResolvedValueOnce([])        // rung 1 fails
      .mockResolvedValue(list(5))       // rung 2 wins, then widen pages
    const auto = createAutoPlaylists({ genre, search, random: () => 0 })
    await auto.resolve(cond())
    // Rung 1 got no widen pages of its own.
    const widenCalls = search.mock.calls.filter((c) => c[1])
    expect(widenCalls).toHaveLength(EXTRA_PAGES)
  })

  it('de-duplicates across pages', async () => {
    const search = vi.fn(async () => list(6)) // every page returns the same ids
    const auto = createAutoPlaylists({ genre, search, random: () => 0 })
    await auto.resolve(cond())
    expect(auto.poolSize(cond())).toBe(6)
  })

  it('stops paging when a page comes back empty', async () => {
    const search = vi.fn()
      .mockResolvedValueOnce(list(5))
      .mockResolvedValueOnce([])
    const auto = createAutoPlaylists({ genre, search, random: () => 0 })
    await auto.resolve(cond())
    expect(search.mock.calls.filter((c) => c[1])).toHaveLength(1)
  })

  it('keeps the first page when a later one errors', async () => {
    const search = vi.fn()
      .mockResolvedValueOnce(list(5))
      .mockRejectedValue(new Error('rate limited'))
    const auto = createAutoPlaylists({ genre, search, random: () => 0 })
    await expect(auto.resolve(cond())).resolves.not.toBeNull()
    expect(auto.poolSize(cond())).toBe(5)
  })

  it('filters contradicting results out of the extra pages too', async () => {
    const search = vi.fn(async (_q: string, offset?: number) =>
      offset
        ? [{ id: 'r', name: 'lofi rain', owner: 'u' }]
        : list(4))
    const auto = createAutoPlaylists({ genre, search, random: () => 0 })
    await auto.resolve(cond({ precip: 'none' }))
    expect(auto.poolSize(cond({ precip: 'none' }))).toBe(4)
  })
})

describe('usedQuery', () => {
  it('reports the rung that produced the pool', async () => {
    const search = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValue(list(5))
    const auto = createAutoPlaylists({ genre, search, random: () => 0 })
    await auto.resolve(cond())
    // The second rung won, so that is what it must report.
    expect(auto.usedQuery(cond())).toBe(search.mock.calls[1][0])
  })

  it('is null before anything is resolved', () => {
    const auto = createAutoPlaylists({ genre, search: async () => [], random: () => 0 })
    expect(auto.usedQuery(cond())).toBeNull()
  })

  it('is per signature, so it cannot report another condition\'s query', async () => {
    const search = vi.fn(async () => list(5))
    const auto = createAutoPlaylists({ genre, search, random: () => 0 })
    await auto.resolve(cond({ temp: 'cold' }))
    expect(auto.usedQuery(cond({ temp: 'cold' }))).toContain('cold')
    expect(auto.usedQuery(cond({ temp: 'hot' }))).toBeNull()
  })
})
