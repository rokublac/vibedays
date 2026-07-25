import { describe, it, expect, vi } from 'vitest'
import { buildPlayer } from './player'
import type { TrackInfo } from '../spotify/player'

const cb = () => ({ onToggle: vi.fn(), onNext: vi.fn(), onPrev: vi.fn() })
// Run the fade swap synchronously so assertions see the settled DOM.
const NOW = { schedule: (fn: () => void) => fn() }

const TRACK: TrackInfo = {
  name: 'Tonight',
  artists: 'Brad Beal',
  artworkUrl: 'art.jpg',
  url: 'https://open.spotify.com/track/abc123',
  context: { label: 'Late night lofi', url: 'https://open.spotify.com/playlist/p1' },
}

describe('buildPlayer', () => {
  it('wires the transport buttons to callbacks', () => {
    const root = document.createElement('div')
    const callbacks = cb()
    buildPlayer(root, callbacks, NOW)
    root.querySelector<HTMLButtonElement>('#pl-prev')!.click()
    root.querySelector<HTMLButtonElement>('#pl-toggle')!.click()
    root.querySelector<HTMLButtonElement>('#pl-next')!.click()
    expect(callbacks.onPrev).toHaveBeenCalledTimes(1)
    expect(callbacks.onToggle).toHaveBeenCalledTimes(1)
    expect(callbacks.onNext).toHaveBeenCalledTimes(1)
  })

  it('toggles the play/pause glyph', () => {
    const root = document.createElement('div')
    const player = buildPlayer(root, cb(), NOW)
    const toggle = root.querySelector<HTMLElement>('#pl-toggle')!
    player.update(TRACK, false)
    expect(toggle.textContent).toBe('⏸')
    player.update(TRACK, true)
    expect(toggle.textContent).toBe('▶')
  })

  it('fills the bar and links out to the track', () => {
    const root = document.createElement('div')
    const player = buildPlayer(root, cb(), NOW)
    player.update(TRACK, false)
    const link = root.querySelector<HTMLAnchorElement>('#now-playing')!
    expect(link.hidden).toBe(false)
    expect(root.querySelector('.track-name')!.textContent).toBe('Tonight')
    expect(root.querySelector('.track-artist')!.textContent).toBe('Brad Beal')
    expect(link.getAttribute('href')).toBe('https://open.spotify.com/track/abc123')
    expect(link.getAttribute('aria-label')).toBe('Open Tonight by Brad Beal in Spotify')
    expect(root.querySelector<HTMLImageElement>('.track-art')!.getAttribute('src')).toBe('art.jpg')
  })

  it('opens in a new tab without leaking the referrer', () => {
    const root = document.createElement('div')
    buildPlayer(root, cb(), NOW)
    const link = root.querySelector<HTMLAnchorElement>('#now-playing')!
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('hides the link half when nothing is playing', () => {
    const root = document.createElement('div')
    const player = buildPlayer(root, cb(), NOW)
    player.update(TRACK, false)
    player.update(null, true)
    expect(root.querySelector<HTMLAnchorElement>('#now-playing')!.hidden).toBe(true)
  })

  it('keeps the transport usable with no track, since that is how playback starts', () => {
    const root = document.createElement('div')
    const callbacks = cb()
    const player = buildPlayer(root, callbacks, NOW)
    player.update(null, true)

    const toggle = root.querySelector<HTMLButtonElement>('#pl-toggle')!
    expect(toggle.hidden).toBe(false)
    expect(toggle.closest('[hidden]')).toBeNull()
    toggle.click()
    expect(callbacks.onToggle).toHaveBeenCalledTimes(1)
  })

  it('marks the bar empty before anything plays and clears it on the first track', () => {
    const root = document.createElement('div')
    const player = buildPlayer(root, cb(), NOW)
    const bar = root.querySelector<HTMLDivElement>('.now-bar')!
    expect(bar.classList.contains('is-empty')).toBe(true)
    player.update(TRACK, false)
    expect(bar.classList.contains('is-empty')).toBe(false)
    player.update(null, true)
    expect(bar.classList.contains('is-empty')).toBe(true)
  })

  it('shows a prompt instead of a bare play button before anything plays', () => {
    const root = document.createElement('div')
    buildPlayer(root, cb(), NOW)
    const empty = root.querySelector<HTMLSpanElement>('.track-empty')!
    // Rendered on first paint, before any state callback has fired.
    expect(empty.hidden).toBe(false)
    expect(empty.textContent).toBe('Press play to start')
  })

  it('swaps the prompt for the track, and back again', () => {
    const root = document.createElement('div')
    const player = buildPlayer(root, cb(), NOW)
    const empty = root.querySelector<HTMLSpanElement>('.track-empty')!
    const link = root.querySelector<HTMLAnchorElement>('#now-playing')!

    player.update(TRACK, false)
    expect(empty.hidden).toBe(true)
    expect(link.hidden).toBe(false)

    player.update(null, true)
    expect(empty.hidden).toBe(false)
    expect(link.hidden).toBe(true)
  })

  it('keeps the card but drops the link when the track has no permalink', () => {
    const root = document.createElement('div')
    const player = buildPlayer(root, cb(), NOW)
    player.update({ ...TRACK, url: null }, false)
    const link = root.querySelector<HTMLAnchorElement>('#now-playing')!
    expect(link.hasAttribute('href')).toBe(false)
    expect(link.getAttribute('aria-disabled')).toBe('true')
    expect(root.querySelector('.track-name')!.textContent).toBe('Tonight')
  })

  it('hides the artwork slot when there is no album image', () => {
    const root = document.createElement('div')
    const player = buildPlayer(root, cb(), NOW)
    player.update({ ...TRACK, artworkUrl: null }, false)
    expect(root.querySelector<HTMLImageElement>('.track-art')!.hidden).toBe(true)
  })

  it('restores the link after a track without one', () => {
    const root = document.createElement('div')
    const player = buildPlayer(root, cb(), NOW)
    player.update({ ...TRACK, url: null }, false)
    player.update(TRACK, false)
    const link = root.querySelector<HTMLAnchorElement>('#now-playing')!
    expect(link.getAttribute('href')).toBe('https://open.spotify.com/track/abc123')
    expect(link.hasAttribute('aria-disabled')).toBe(false)
  })

  it('shows which playlist playback is coming from', () => {
    const root = document.createElement('div')
    const player = buildPlayer(root, cb(), NOW)
    player.update(TRACK, false)
    const line = root.querySelector<HTMLAnchorElement>('#playing-from')!
    expect(line.hidden).toBe(false)
    expect(root.querySelector('.context-name')!.textContent).toBe('Late night lofi')
    expect(line.getAttribute('href')).toBe('https://open.spotify.com/playlist/p1')
  })

  it('hides the source line when the SDK reports no context', () => {
    const root = document.createElement('div')
    const player = buildPlayer(root, cb(), NOW)
    player.update({ ...TRACK, context: null }, false)
    expect(root.querySelector<HTMLAnchorElement>('#playing-from')!.hidden).toBe(true)
  })

  it('keeps the source label but drops the link when there is no url', () => {
    const root = document.createElement('div')
    const player = buildPlayer(root, cb(), NOW)
    player.update({ ...TRACK, context: { label: 'Recently played', url: null } }, false)
    const line = root.querySelector<HTMLAnchorElement>('#playing-from')!
    expect(line.hidden).toBe(false)
    expect(line.hasAttribute('href')).toBe(false)
    expect(line.getAttribute('aria-disabled')).toBe('true')
  })

  it('hides the source line again when playback stops', () => {
    const root = document.createElement('div')
    const player = buildPlayer(root, cb(), NOW)
    player.update(TRACK, false)
    player.update(null, true)
    expect(root.querySelector<HTMLAnchorElement>('#playing-from')!.hidden).toBe(true)
  })

  it('does not re-fade the bar on a pause or resume of the same track', () => {
    const root = document.createElement('div')
    const schedule = vi.fn((fn: () => void) => fn())
    const player = buildPlayer(root, cb(), { schedule })
    player.update(TRACK, false)          // first paint: rendered directly
    expect(schedule).not.toHaveBeenCalled()
    player.update(TRACK, true)           // same track, just paused
    player.update(TRACK, false)
    expect(schedule).not.toHaveBeenCalled()
  })

  it('fades when the track actually changes', () => {
    const root = document.createElement('div')
    const schedule = vi.fn((fn: () => void) => fn())
    const player = buildPlayer(root, cb(), { schedule })
    player.update(TRACK, false)
    player.update({ ...TRACK, name: 'Another', url: 'https://open.spotify.com/track/zzz' }, false)
    expect(schedule).toHaveBeenCalledTimes(1)
    expect(root.querySelector('.track-name')!.textContent).toBe('Another')
  })

  it('fades when only the playlist changes', () => {
    const root = document.createElement('div')
    const schedule = vi.fn((fn: () => void) => fn())
    const player = buildPlayer(root, cb(), { schedule })
    player.update(TRACK, false)
    player.update({ ...TRACK, context: { label: 'Morning coffee', url: null } }, false)
    expect(schedule).toHaveBeenCalledTimes(1)
    expect(root.querySelector('.context-name')!.textContent).toBe('Morning coffee')
  })
})
