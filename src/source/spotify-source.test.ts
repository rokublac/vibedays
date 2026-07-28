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

describe('createSpotifySource playback', () => {
  /** A fake PlayerHandle plus a record of what was asked of it. */
  function fakePlayer() {
    const calls: string[] = []
    return {
      calls,
      handle: {
        deviceId: 'dev1',
        activate: vi.fn(async () => void calls.push('activate')),
        setVolume: vi.fn(async (v: number) => void calls.push(`vol:${v}`)),
        togglePlay: vi.fn(() => calls.push('toggle')),
        next: vi.fn(() => calls.push('next')),
        previous: vi.fn(() => calls.push('prev')),
      },
    }
  }

  /** Records every Web API call and answers them all successfully. */
  function fakeFetch() {
    const urls: string[] = []
    const fn = vi.fn(async (url: string) => {
      urls.push(String(url))
      if (String(url).includes('fields=tracks')) {
        return { ok: true, json: async () => ({ tracks: { total: 50 } }) } as unknown as Response
      }
      return { ok: true, json: async () => ({}) } as unknown as Response
    })
    return { urls, fn: fn as unknown as typeof fetch }
  }

  function playable(over: Record<string, unknown> = {}) {
    const player = fakePlayer()
    const net = fakeFetch()
    const initPlayer = vi.fn(async () => player.handle)
    const source = createSpotifySource({
      getToken: async () => 'token',
      genre: () => GENRES[0],
      callbacks: { onState: vi.fn(), onFatal: vi.fn() },
      search: searchStub(),
      random: () => 0,
      fetchFn: net.fn,
      initPlayer: initPlayer as never,
      ...over,
    } as never)
    return { source, player, net, initPlayer }
  }

  const SEL = { id: 'pl0', label: 'Playlist 0', url: null }

  it('initialises the SDK lazily, on first start', async () => {
    const { source, initPlayer } = playable()
    expect(initPlayer).not.toHaveBeenCalled()
    await source.start(SEL)
    expect(initPlayer).toHaveBeenCalledTimes(1)
  })

  it('does not initialise the SDK twice', async () => {
    const { source, initPlayer } = playable()
    await source.start(SEL)
    await source.start({ ...SEL, id: 'pl1' })
    expect(initPlayer).toHaveBeenCalledTimes(1)
  })

  it('requests the playlist and then sets shuffle', async () => {
    const { source, net } = playable()
    await source.start(SEL)
    const play = net.urls.find((u) => u.includes('/me/player/play'))
    const shuffle = net.urls.find((u) => u.includes('/me/player/shuffle'))
    expect(play).toContain('device_id=dev1')
    expect(shuffle).toContain('state=true')
  })

  it('delegates transport and volume to the handle', async () => {
    const { source, player } = playable()
    await source.start(SEL)
    source.togglePlay()
    source.next()
    source.previous()
    await source.setVolume(0.4)
    expect(player.calls).toContain('toggle')
    expect(player.calls).toContain('next')
    expect(player.calls).toContain('prev')
    expect(player.calls).toContain('vol:0.4')
  })

  it('is silent about volume before the player exists', async () => {
    // main pushes the stored volume at boot, long before anything plays.
    const { source } = playable()
    await expect(source.setVolume(0.4)).resolves.toBeUndefined()
  })

  it('activates the element for the play gesture', async () => {
    const { source, player } = playable()
    await source.activate()
    expect(player.calls).toContain('activate')
  })

  it('reports an account failure without clearing anything', async () => {
    // A free-tier plan is not a bad token; treating it as one loops the user
    // back to the login screen forever.
    const onFatal = vi.fn()
    const initPlayer = vi.fn(async (_g: unknown, cb: { onFatal: Function }) => {
      cb.onFatal('account', 'not premium')
      throw new Error('account: not premium')
    })
    const { source } = playable({ callbacks: { onState: vi.fn(), onFatal }, initPlayer })
    await source.start(SEL).catch(() => {})
    expect(onFatal).toHaveBeenCalledWith('account', 'not premium')
  })

  it('allows a later attempt after a failed init', async () => {
    let attempt = 0
    const player = fakePlayer()
    const initPlayer = vi.fn(async () => {
      if (++attempt === 1) throw new Error('init failed')
      return player.handle
    })
    const { source } = playable({ initPlayer })
    await source.start(SEL).catch(() => {})
    await source.start(SEL)
    expect(initPlayer).toHaveBeenCalledTimes(2)
  })

  it('teardown releases the player, and a later start re-initialises', async () => {
    const { source, initPlayer } = playable()
    await source.start(SEL)
    await source.teardown()
    await source.start(SEL)
    expect(initPlayer).toHaveBeenCalledTimes(2)
  })

  it('teardown is safe before anything played', async () => {
    await expect(playable().source.teardown()).resolves.toBeUndefined()
  })
})
