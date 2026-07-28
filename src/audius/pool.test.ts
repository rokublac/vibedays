import { describe, it, expect, vi } from 'vitest'
import { createTrackPool } from './pool'
import type { AudiusTrack } from './types'
import type { Conditions } from '../types'
import { genreById } from '../config/genres'

const CONDITIONS: Conditions = {
  located: true,
  phase: 'evening',
  season: 'summer',
  weather: 'clear',
  cloud: null,
  precip: null,
  temp: 'mild',
}

const track = (id: string): AudiusTrack => ({
  id,
  title: `Track ${id}`,
  duration: 200,
  permalink: `/artist/${id}`,
  artworkUrl: null,
  artist: 'Someone',
})

/** Returns a distinct page per offset, so paging is observable. */
function pagedSearch(pageCount = 3) {
  return vi.fn(async (p: { offset?: number }) => {
    const page = (p.offset ?? 0) / 100
    if (page >= pageCount) return []
    return Array.from({ length: 5 }, (_, i) => track(`p${page}t${i}`))
  })
}

function make(over: Record<string, unknown> = {}, pageCount = 3) {
  // The spy is built here and never overridden, so the returned handle is
  // always the one the pool actually called.
  const search = pagedSearch(pageCount)
  const pool = createTrackPool({
    genre: () => genreById('lofi'),
    random: () => 0,
    ...over,
    search: search as never,
  })
  return { pool, search }
}

describe('createTrackPool', () => {
  it('resolves a pool of tracks', async () => {
    const { pool } = make()
    const tracks = await pool.resolve(CONDITIONS)
    expect(tracks).toHaveLength(5)
    expect(tracks.every((t) => t.id.startsWith('p0'))).toBe(true)
  })

  it('pins the pool, so the render tick does not research every second', async () => {
    const { pool, search } = make()
    await pool.resolve(CONDITIONS)
    await pool.resolve(CONDITIONS)
    expect(search).toHaveBeenCalledTimes(1)
  })

  it('shares an in-flight request rather than firing a burst', async () => {
    const { pool, search } = make()
    const [a, b] = await Promise.all([pool.resolve(CONDITIONS), pool.resolve(CONDITIONS)])
    expect(search).toHaveBeenCalledTimes(1)
    expect(a).toEqual(b)
  })

  it('pages deeper on advance, returning different tracks', async () => {
    const { pool, search } = make()
    const first = await pool.resolve(CONDITIONS)
    const second = await pool.advance(CONDITIONS)
    expect(search).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 100 }))
    // Verified against the live API: offset=100 has zero id overlap with 0.
    const overlap = second.filter((t) => first.some((f) => f.id === t.id))
    expect(overlap).toHaveLength(0)
  })

  it('keeps paging on each advance', async () => {
    const { pool, search } = make()
    await pool.resolve(CONDITIONS)
    await pool.advance(CONDITIONS)
    await pool.advance(CONDITIONS)
    expect(search).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 200 }))
  })

  it('wraps to the start when a page comes back empty', async () => {
    // Running off the end of the catalogue must not leave the listener with
    // an empty queue and silence.
    const { pool, search } = make({}, 1)
    await pool.resolve(CONDITIONS)
    const wrapped = await pool.advance(CONDITIONS)
    expect(wrapped).toHaveLength(5)
    expect(search).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 0 }))
  })

  it('reports the pool size, and zero before resolving', async () => {
    const { pool } = make()
    expect(pool.size(CONDITIONS)).toBe(0)
    await pool.resolve(CONDITIONS)
    expect(pool.size(CONDITIONS)).toBe(5)
  })

  it('pins genres separately, so switching back returns what you had', async () => {
    let genre = genreById('lofi')
    const { pool, search } = make({ genre: () => genre })
    await pool.resolve(CONDITIONS)
    genre = genreById('jazz')
    await pool.resolve(CONDITIONS)
    expect(search).toHaveBeenCalledTimes(2)
  })

  it('shuffles, so two listeners on the same conditions differ', async () => {
    // random()=0 sends every Fisher-Yates swap to index 0, which permutes the
    // deck deterministically. (A random pinned at ~1 would swap each element
    // with itself and prove nothing.)
    const { pool } = make()
    const tracks = await pool.resolve(CONDITIONS)
    expect(tracks).toHaveLength(5)
    expect(tracks.map((t) => t.id)).not.toEqual(['p0t0', 'p0t1', 'p0t2', 'p0t3', 'p0t4'])
    expect([...tracks].map((t) => t.id).sort())
      .toEqual(['p0t0', 'p0t1', 'p0t2', 'p0t3', 'p0t4'])
  })
})
