import { describe, it, expect, vi } from 'vitest'
import { createSpotifySource } from './spotify-source'
import type { Conditions } from '../types'
import { GENRES } from '../config/genres'

const CONDITIONS: Conditions = {
  located: true,
  phase: 'evening',
  season: 'winter',
  weather: 'clear',
  cloud: 'clear',
  precip: 'none',
  temp: 'cold',
}

/** Search stub returning N distinct playlists for every query. */
function searchStub(count = 5) {
  return vi.fn(async () =>
    Array.from({ length: count }, (_, i) => ({
      id: `pl${i}`,
      name: `Playlist ${i}`,
      owner: 'someone',
    })),
  )
}

function make(over: Partial<Parameters<typeof createSpotifySource>[0]> = {}) {
  const search = searchStub()
  const source = createSpotifySource({
    getToken: async () => 'token',
    genre: () => GENRES[0],
    callbacks: { onState: vi.fn(), onFatal: vi.fn() },
    search,
    // Deterministic: always picks the first candidate.
    random: () => 0,
    ...over,
  })
  return { source, search }
}

describe('createSpotifySource resolution', () => {
  it('identifies itself as the spotify source', () => {
    expect(make().source.id).toBe('spotify')
  })

  it('maps a playlist to a selection with a permalink', async () => {
    const { source } = make()
    const sel = await source.resolve(CONDITIONS)
    expect(sel).toEqual({
      id: 'pl0',
      label: 'Playlist 0',
      url: 'https://open.spotify.com/playlist/pl0',
    })
  })

  it('returns null when nothing is found', async () => {
    const { source } = make({ search: vi.fn(async () => []) })
    expect(await source.resolve(CONDITIONS)).toBeNull()
  })

  it('reports the pool size as alternatives', async () => {
    const { source } = make()
    await source.resolve(CONDITIONS)
    expect(source.alternatives(CONDITIONS)).toBeGreaterThan(1)
  })

  it('rerolls within the pinned pool without searching again', async () => {
    const { source, search } = make()
    const first = await source.resolve(CONDITIONS)
    const callsAfterResolve = search.mock.calls.length
    const second = await source.reroll(CONDITIONS)
    expect(second!.id).not.toBe(first!.id)
    expect(search.mock.calls.length).toBe(callsAfterResolve)
  })

  it('pins the choice, so the same conditions return the same selection', async () => {
    // The render tick fires once a second; without pinning the music would
    // change under the listener every tick.
    const { source } = make()
    const a = await source.resolve(CONDITIONS)
    const b = await source.resolve(CONDITIONS)
    expect(b).toEqual(a)
  })

  it('shares an in-flight search rather than firing a burst', async () => {
    // The render tick fires once a second, so a condition change can be asked
    // for again before the first walk has returned. Both callers must ride the
    // same walk: two walks would double every request.
    const alone = make()
    await alone.source.resolve(CONDITIONS)

    const together = make()
    const [a, b] = await Promise.all([
      together.source.resolve(CONDITIONS),
      together.source.resolve(CONDITIONS),
    ])

    expect(a).toEqual(b)
    expect(together.search.mock.calls.length).toBe(alone.search.mock.calls.length)
  })

  it('reports no alternatives before anything is resolved', () => {
    expect(make().source.alternatives(CONDITIONS)).toBe(0)
  })
})
