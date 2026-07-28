import { describe, it, expect, vi } from 'vitest'
import { createAudiusPlayer, MAX_CONSECUTIVE_ERRORS } from './player'
import type { AudiusTrack } from './types'

const track = (id: string): AudiusTrack => ({
  id,
  title: `Track ${id}`,
  duration: 200,
  permalink: `/artist/${id}`,
  artworkUrl: `https://cdn/${id}.jpg`,
  artist: 'Someone',
})

const QUEUE = [track('a'), track('b'), track('c')]

/**
 * Stands in for <audio>: records src/volume and lets tests fire events.
 * src, volume and paused go through defineProperty because HTMLAudioElement
 * declares paused read-only, so a plain assignment will not typecheck.
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
  el.load = vi.fn()
  return el
}

function make() {
  const el = fakeAudio()
  const onState = vi.fn()
  const onError = vi.fn()
  const player = createAudiusPlayer({ onState, onError }, el)
  return { el, onState, onError, player }
}

const fire = (el: HTMLAudioElement, name: string) => el.dispatchEvent(new Event(name))

describe('createAudiusPlayer', () => {
  it('plays the first track of the queue', async () => {
    const { el, player } = make()
    player.setQueue(QUEUE)
    await player.play()
    expect(el.src).toContain('/v1/tracks/a/stream')
    expect(el.play).toHaveBeenCalled()
  })

  it('advances with next, making no network calls', async () => {
    // The whole point of owning the queue: skipping is free.
    const net = vi.fn()
    const { el, player } = make()
    globalThis.fetch = net as never
    player.setQueue(QUEUE)
    await player.play()
    player.next()
    expect(el.src).toContain('/v1/tracks/b/stream')
    player.next()
    expect(el.src).toContain('/v1/tracks/c/stream')
    expect(net).not.toHaveBeenCalled()
  })

  it('goes back with previous, and stays put at the start', async () => {
    const { el, player } = make()
    player.setQueue(QUEUE)
    await player.play()
    player.next()
    player.previous()
    expect(el.src).toContain('/v1/tracks/a/stream')
    player.previous()
    expect(el.src).toContain('/v1/tracks/a/stream')
  })

  it('advances by itself when a track ends', async () => {
    const { el, player } = make()
    player.setQueue(QUEUE)
    await player.play()
    fire(el, 'ended')
    expect(el.src).toContain('/v1/tracks/b/stream')
  })

  it('wraps at the end of the queue rather than stopping', async () => {
    const { el, player } = make()
    player.setQueue(QUEUE)
    await player.play()
    fire(el, 'ended')
    fire(el, 'ended')
    fire(el, 'ended')
    expect(el.src).toContain('/v1/tracks/a/stream')
  })

  it('skips a track that fails to load rather than stalling', async () => {
    // A dead CDN object must not end the session.
    const { el, player } = make()
    player.setQueue(QUEUE)
    await player.play()
    fire(el, 'error')
    expect(el.src).toContain('/v1/tracks/b/stream')
  })

  it('reports instead of spinning when everything fails', async () => {
    const { el, player, onError } = make()
    player.setQueue(QUEUE)
    await player.play()
    for (let i = 0; i < MAX_CONSECUTIVE_ERRORS; i++) fire(el, 'error')
    expect(onError).toHaveBeenCalledTimes(1)
  })

  it('forgets earlier failures once a track plays', async () => {
    const { el, player, onError } = make()
    player.setQueue(QUEUE)
    await player.play()
    for (let i = 0; i < MAX_CONSECUTIVE_ERRORS - 1; i++) fire(el, 'error')
    fire(el, 'playing')
    for (let i = 0; i < MAX_CONSECUTIVE_ERRORS - 1; i++) fire(el, 'error')
    expect(onError).not.toHaveBeenCalled()
  })

  it('reports what is playing, linking out to audius', async () => {
    const { player, onState } = make()
    player.setQueue(QUEUE)
    await player.play()
    expect(onState).toHaveBeenLastCalledWith(
      expect.objectContaining({
        name: 'Track a',
        artists: 'Someone',
        artworkUrl: 'https://cdn/a.jpg',
        url: 'https://audius.co/artist/a',
      }),
      false,
    )
  })

  it('carries a context label into the now-playing line', async () => {
    const { player, onState } = make()
    player.setContext({ label: 'Peaceful lofi', url: null })
    player.setQueue(QUEUE)
    await player.play()
    expect(onState.mock.lastCall![0].context).toEqual({ label: 'Peaceful lofi', url: null })
  })

  it('toggles play and pause', async () => {
    const { el, player } = make()
    player.setQueue(QUEUE)
    await player.play()
    player.togglePlay()
    expect(el.pause).toHaveBeenCalled()
  })

  it('sets volume on the element', async () => {
    const { el, player } = make()
    await player.setVolume(0.25)
    expect(el.volume).toBe(0.25)
  })

  it('clamps volume to what the element accepts', async () => {
    const { el, player } = make()
    await player.setVolume(1.5)
    expect(el.volume).toBe(1)
    await player.setVolume(-1)
    expect(el.volume).toBe(0)
  })

  it('teardown pauses and releases the audio', async () => {
    const { el, player } = make()
    player.setQueue(QUEUE)
    await player.play()
    await player.teardown()
    expect(el.pause).toHaveBeenCalled()
    expect(el.src).toBe('')
  })

  it('does nothing on an empty queue rather than throwing', async () => {
    const { player } = make()
    player.setQueue([])
    await expect(player.play()).resolves.toBeUndefined()
  })
})
