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

function pagedSearch(pageCount = 3) {
  return vi.fn(async (p: { offset?: number }) => {
    const page = (p.offset ?? 0) / 100
    if (page >= pageCount) return []
    return Array.from({ length: 4 }, (_, i) => track(`p${page}t${i}`))
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

function make(over: Record<string, unknown> = {}, pageCount = 3) {
  // Resolved once and passed exactly once, so the returned spy is always the
  // one the source actually called.
  const search = (over.search as ReturnType<typeof pagedSearch>) ?? pagedSearch(pageCount)
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
      id: 'Lo-Fi|Cool|0',
      label: 'Cool lofi',
      url: null,
    })
  })

  it('returns null when the catalogue has nothing', async () => {
    const { source } = make({}, 0)
    expect(await source.resolve(CONDITIONS)).toBeNull()
  })

  it('reports the pool size as alternatives', async () => {
    const { source } = make()
    await source.resolve(CONDITIONS)
    expect(source.alternatives(CONDITIONS)).toBe(4)
  })

  it('rerolls to a fresh batch with a distinct id', async () => {
    // The id must differ or main's startingId guard would suppress the restart.
    const { source } = make()
    const first = await source.resolve(CONDITIONS)
    const second = await source.reroll(CONDITIONS)
    expect(second!.id).toBe('Lo-Fi|Cool|100')
    expect(second!.id).not.toBe(first!.id)
  })

  it('starts playback from the pool', async () => {
    const { source, el } = make()
    const sel = await source.resolve(CONDITIONS)
    await source.start(sel!)
    expect(el.src).toContain('/stream')
    expect(el.play).toHaveBeenCalled()
  })

  it('skips without touching the network', async () => {
    // Owning the queue is what makes hammering next free.
    const { source, search } = make()
    const sel = await source.resolve(CONDITIONS)
    await source.start(sel!)
    const callsAfterStart = search.mock.calls.length
    source.next()
    source.next()
    source.previous()
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
