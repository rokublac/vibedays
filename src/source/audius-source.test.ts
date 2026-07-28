import { describe, it, expect, vi } from 'vitest'
import { createAudiusSource } from './audius-source'
import type { AudiusTrack } from '../audius/types'
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

function pagedSearch(pageCount = 3, perPage = 4) {
  return vi.fn(async (p: { offset?: number }) => {
    const page = (p.offset ?? 0) / 100
    if (page >= pageCount) return []
    return Array.from({ length: perPage }, (_, i) => track(`p${page}t${i}`))
  })
}

/**
 * Minimal <audio> stand-in; the player's own tests cover it properly.
 * Uses defineProperty because HTMLAudioElement declares paused read-only.
 */
function fakeAudio() {
  const state = { src: '', volume: 1, paused: true }
  const el = new EventTarget() as unknown as HTMLAudioElement
  const prop = <T>(name: string, get: () => T, set: (v: T) => void) =>
    Object.defineProperty(el, name, { get, set })
  prop('src', () => state.src, (v: string) => { state.src = v })
  prop('volume', () => state.volume, (v: number) => { state.volume = v })
  prop('paused', () => state.paused, (v: boolean) => { state.paused = v })
  el.play = vi.fn(async () => { state.paused = false })
  el.pause = vi.fn(() => { state.paused = true })
  return el
}

function make(over: Record<string, unknown> = {}, pageCount = 3, perPage = 4) {
  // Resolved once and passed exactly once, so the returned spy is always the
  // one the source actually called.
  const search = (over.search as ReturnType<typeof pagedSearch>) ?? pagedSearch(pageCount, perPage)
  const el = fakeAudio()
  const onFatal = vi.fn()
  const onState = vi.fn()
  const source = createAudiusSource({
    genre: () => genreById('lofi'),
    callbacks: { onState, onFatal },
    random: () => 0,
    audio: el,
    ...over,
    search: search as never,
  })
  return { source, search, el, onFatal, onState }
}

describe('createAudiusSource', () => {
  it('identifies itself as the audius source', () => {
    expect(make().source.id).toBe('audius')
  })

  it('resolves to a selection describing the mood', async () => {
    const sel = await make().source.resolve(CONDITIONS)
    // A pool has no permalink, so there is nothing to link the line to.
    expect(sel).toEqual({
      id: 'Lo-Fi|night|Cool|0',
      label: 'Cool night',
      url: null,
    })
  })

  it('returns null when the catalogue has nothing', async () => {
    const { source } = make({}, 0)
    expect(await source.resolve(CONDITIONS)).toBeNull()
  })

  it('pages deeper as the queue runs low, so skipping never runs out', async () => {
    // Replaces the old "Try another" button: with individual tracks rather
    // than playlists, a batch boundary is invisible, so paging happens on its
    // own instead of asking the listener to press something.
    const { source, search, el } = make()
    const sel = await source.resolve(CONDITIONS)
    await source.start(sel!)
    const before = search.mock.calls.length

    // Four tracks in the page and PREFETCH_WITHIN is 5, so the first skip
    // already counts as running low.
    source.next()
    await new Promise((r) => setTimeout(r, 0))

    expect(search.mock.calls.length).toBe(before + 1)
    expect(search.mock.calls.at(-1)![0]).toMatchObject({ offset: 100 })
    expect(el.src).toContain('/stream')
  })

  it('appends rather than replacing, so the current track keeps playing', async () => {
    const { source, el } = make()
    const sel = await source.resolve(CONDITIONS)
    await source.start(sel!)
    const playingNow = el.src
    await new Promise((r) => setTimeout(r, 0))
    expect(el.src).toBe(playingNow)
  })

  it('survives running out of pages without stopping the music', async () => {
    // One page only: the top-up finds nothing and the queue simply loops.
    const { source, el } = make({}, 1)
    const sel = await source.resolve(CONDITIONS)
    await source.start(sel!)
    for (let i = 0; i < 6; i++) source.next()
    await new Promise((r) => setTimeout(r, 0))
    expect(el.src).toContain('/stream')
  })

  it('starts playback from the pool', async () => {
    const { source, el } = make()
    const sel = await source.resolve(CONDITIONS)
    await source.start(sel!)
    expect(el.src).toContain('/stream')
    expect(el.play).toHaveBeenCalled()
  })

  it('skips without touching the network', async () => {
    // Owning the queue is what makes hammering next free. Paging only happens
    // near the end of a page, so a real 100-track page costs one request per
    // hundred skips rather than one per skip.
    const { source, search } = make({}, 3, 50)
    const sel = await source.resolve(CONDITIONS)
    await source.start(sel!)
    const callsAfterStart = search.mock.calls.length
    for (let i = 0; i < 10; i++) source.next()
    source.previous()
    await new Promise((r) => setTimeout(r, 0))
    expect(search.mock.calls.length).toBe(callsAfterStart)
  })

  it('sets volume on the element', async () => {
    const { source, el } = make()
    await source.setVolume(0.3)
    expect(el.volume).toBe(0.3)
  })

  it('reports a search failure as network, never as auth', async () => {
    // The free source has no token. Reporting 'auth' would throw the login
    // card at someone who never signed in.
    const { source, onFatal } = make({
      search: vi.fn(async () => { throw new Error('offline') }) as never,
    })
    expect(await source.resolve(CONDITIONS)).toBeNull()
    expect(onFatal).toHaveBeenCalledWith('network', expect.stringContaining('offline'))
    expect(onFatal).not.toHaveBeenCalledWith('auth', expect.anything())
  })

  it('finishes starting even when playback never actually begins', async () => {
    // Regression: start() used to await el.play(), which stays pending on a
    // stalled load or blocked autoplay. main awaits start() inside its busy
    // counter, so a pending play wedged every control on for the session.
    const el = fakeAudio()
    el.play = vi.fn(() => new Promise<void>(() => {})) // never settles
    const { source } = make({ audio: el })
    const sel = await source.resolve(CONDITIONS)
    await expect(
      Promise.race([
        source.start(sel!).then(() => 'started'),
        new Promise((r) => setTimeout(() => r('hung'), 50)),
      ]),
    ).resolves.toBe('started')
  })

  it('teardown pauses and releases', async () => {
    const { source, el } = make()
    const sel = await source.resolve(CONDITIONS)
    await source.start(sel!)
    await source.teardown()
    expect(el.pause).toHaveBeenCalled()
    expect(el.src).toBe('')
  })

  it('teardown is safe before anything played', async () => {
    await expect(make().source.teardown()).resolves.toBeUndefined()
  })
})
