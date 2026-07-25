import { describe, it, expect, vi } from 'vitest'
import { buildPlayer, IDLE_PROMPT, BUSY_PROMPT, SWITCHING_STATUS } from './player'
import type { TrackInfo } from '../spotify/player'

const cb = () => ({ onToggle: vi.fn(), onNext: vi.fn(), onPrev: vi.fn(), onReroll: vi.fn() })
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
    expect(empty.textContent).toBe(IDLE_PROMPT)
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

  it('exposes the full playlist name on hover, since it truncates', () => {
    const root = document.createElement('div')
    const player = buildPlayer(root, cb(), NOW)
    const long = 'Winter chill | cozy lofi vibes | lofi winter | relaxing chill beats | winter lofi'
    player.update({ ...TRACK, context: { label: long, url: null } }, false)
    expect(root.querySelector<HTMLElement>('.context-name')!.title).toBe(long)
  })

  it('shows which playlist playback is coming from', () => {
    const root = document.createElement('div')
    const player = buildPlayer(root, cb(), NOW)
    player.update(TRACK, false)
    const line = root.querySelector<HTMLAnchorElement>('#playing-from')!
    expect(root.querySelector<HTMLDivElement>('.context-row')!.hidden).toBe(false)
    expect(root.querySelector('.context-name')!.textContent).toBe('Late night lofi')
    expect(line.getAttribute('href')).toBe('https://open.spotify.com/playlist/p1')
  })

  it('hides the source line when the SDK reports no context', () => {
    const root = document.createElement('div')
    const player = buildPlayer(root, cb(), NOW)
    player.update({ ...TRACK, context: null }, false)
    expect(root.querySelector<HTMLDivElement>('.context-row')!.hidden).toBe(true)
  })

  it('offers a way to switch playlist without waiting for the vibe to change', () => {
    const root = document.createElement('div')
    const callbacks = cb()
    const player = buildPlayer(root, callbacks, NOW)
    player.update(TRACK, false)
    root.querySelector<HTMLButtonElement>('#reroll')!.click()
    expect(callbacks.onReroll).toHaveBeenCalledTimes(1)
  })

  it('says it is working while a search is in flight', () => {
    const root = document.createElement('div')
    const player = buildPlayer(root, cb(), NOW)
    const empty = root.querySelector<HTMLSpanElement>('.track-empty')!
    const bar = root.querySelector<HTMLDivElement>('.now-bar')!

    player.setBusy(true)
    expect(empty.textContent).toBe(BUSY_PROMPT)
    expect(bar.classList.contains('is-busy')).toBe(true)
  })

  it('returns to the idle prompt when the work finishes', () => {
    const root = document.createElement('div')
    const player = buildPlayer(root, cb(), NOW)
    const empty = root.querySelector<HTMLSpanElement>('.track-empty')!
    const bar = root.querySelector<HTMLDivElement>('.now-bar')!

    player.setBusy(true)
    player.setBusy(false)
    expect(empty.textContent).toBe(IDLE_PROMPT)
    expect(bar.classList.contains('is-busy')).toBe(false)
  })

  it('replaces the playlist name with a status while switching', () => {
    const root = document.createElement('div')
    const player = buildPlayer(root, cb(), NOW)
    player.update(TRACK, false)
    player.setBusy(true)

    const status = root.querySelector<HTMLSpanElement>('.context-status')!
    expect(status.hidden).toBe(false)
    expect(status.textContent).toBe(SWITCHING_STATUS)
    // The old playlist name is not left sitting there claiming to be current.
    expect(root.querySelector<HTMLAnchorElement>('#playing-from')!.hidden).toBe(true)
    expect(root.querySelector<HTMLDivElement>('.context-row')!.hidden).toBe(false)
  })

  it('puts the playlist name back when the switch lands', () => {
    const root = document.createElement('div')
    const player = buildPlayer(root, cb(), NOW)
    player.update(TRACK, false)
    player.setBusy(true)
    player.update({ ...TRACK, name: 'Another', context: { label: 'New list', url: null } }, false)
    player.setBusy(false)

    expect(root.querySelector<HTMLSpanElement>('.context-status')!.hidden).toBe(true)
    expect(root.querySelector<HTMLAnchorElement>('#playing-from')!.hidden).toBe(false)
    expect(root.querySelector('.context-name')!.textContent).toBe('New list')
  })

  it('does not show the status before anything has played', () => {
    const root = document.createElement('div')
    const player = buildPlayer(root, cb(), NOW)
    player.setBusy(true)
    // The empty prompt already says it; the row would be an empty second voice.
    expect(root.querySelector<HTMLSpanElement>('.context-status')!.hidden).toBe(true)
    expect(root.querySelector<HTMLSpanElement>('.track-empty')!.textContent).toBe(BUSY_PROMPT)
  })

  it('hides the switch button while a switch is running', () => {
    const root = document.createElement('div')
    const player = buildPlayer(root, cb(), NOW)
    player.update(TRACK, false)
    player.setAlternatives(6)
    const btn = root.querySelector<HTMLButtonElement>('#reroll')!
    expect(btn.hidden).toBe(false)

    player.setBusy(true)
    // Greyed out next to "Finding a playlist…" was the same message twice.
    expect(btn.hidden).toBe(true)
    expect(btn.disabled).toBe(true)

    player.setBusy(false)
    expect(btn.hidden).toBe(false)
    expect(btn.disabled).toBe(false)
  })

  it('stays visible but disabled when there is simply nothing to switch to', () => {
    const root = document.createElement('div')
    const player = buildPlayer(root, cb(), NOW)
    player.update(TRACK, false)
    player.setAlternatives(1)
    const btn = root.querySelector<HTMLButtonElement>('#reroll')!
    expect(btn.hidden).toBe(false)
    expect(btn.disabled).toBe(true)
  })

  it('disables the switch button when there is nothing else to switch to', () => {
    const root = document.createElement('div')
    const player = buildPlayer(root, cb(), NOW)
    player.update(TRACK, false)
    const btn = root.querySelector<HTMLButtonElement>('#reroll')!

    player.setAlternatives(1)
    expect(btn.disabled).toBe(true)
    expect(btn.title).toContain('No other playlists')

    player.setAlternatives(0)
    expect(btn.disabled).toBe(true)
  })

  it('enables it and says how many alternatives there are', () => {
    const root = document.createElement('div')
    const player = buildPlayer(root, cb(), NOW)
    player.update(TRACK, false)
    const btn = root.querySelector<HTMLButtonElement>('#reroll')!

    player.setAlternatives(7)
    expect(btn.disabled).toBe(false)
    expect(btn.title).toContain('6 other playlists')

    player.setAlternatives(2)
    expect(btn.title).toContain('1 other playlist')
    expect(btn.title).not.toContain('playlists')
  })

  it('re-enables when a later condition has a bigger pool', () => {
    const root = document.createElement('div')
    const player = buildPlayer(root, cb(), NOW)
    player.update(TRACK, false)
    const btn = root.querySelector<HTMLButtonElement>('#reroll')!
    player.setAlternatives(1)
    player.setAlternatives(5)
    expect(btn.disabled).toBe(false)
  })

  it('hides the switch button along with the source row when nothing plays', () => {
    const root = document.createElement('div')
    const player = buildPlayer(root, cb(), NOW)
    player.update(null, true)
    expect(root.querySelector<HTMLButtonElement>('#reroll')!.closest('[hidden]')).not.toBeNull()
  })

  it('keeps the source label but drops the link when there is no url', () => {
    const root = document.createElement('div')
    const player = buildPlayer(root, cb(), NOW)
    player.update({ ...TRACK, context: { label: 'Recently played', url: null } }, false)
    const line = root.querySelector<HTMLAnchorElement>('#playing-from')!
    expect(root.querySelector<HTMLDivElement>('.context-row')!.hidden).toBe(false)
    expect(line.hasAttribute('href')).toBe(false)
    expect(line.getAttribute('aria-disabled')).toBe('true')
  })

  it('hides the source line again when playback stops', () => {
    const root = document.createElement('div')
    const player = buildPlayer(root, cb(), NOW)
    player.update(TRACK, false)
    player.update(null, true)
    expect(root.querySelector<HTMLDivElement>('.context-row')!.hidden).toBe(true)
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

  it('writes a late-arriving playlist name in place, without re-fading the card', () => {
    const root = document.createElement('div')
    const schedule = vi.fn((fn: () => void) => fn())
    const player = buildPlayer(root, cb(), { schedule })
    player.update(TRACK, false)
    // Same track, context filled in afterwards: the SDK often reports it late,
    // and fading the whole card again for a subtitle read as a flicker.
    player.update({ ...TRACK, context: { label: 'Morning coffee', url: null } }, false)
    expect(schedule).not.toHaveBeenCalled()
    expect(root.querySelector('.context-name')!.textContent).toBe('Morning coffee')
  })

  it('does not flash the empty bar while switching playlists', () => {
    const root = document.createElement('div')
    const schedule = vi.fn((fn: () => void) => fn())
    const player = buildPlayer(root, cb(), { schedule })
    player.update(TRACK, false)

    // What a switch actually looks like from the SDK: a momentary empty state
    // between the old track and the new one.
    player.setBusy(true)
    player.update(null, true)

    const bar = root.querySelector<HTMLDivElement>('.now-bar')!
    expect(bar.classList.contains('is-empty')).toBe(false)
    expect(root.querySelector<HTMLAnchorElement>('#now-playing')!.hidden).toBe(false)

    const next = { ...TRACK, name: 'Another', url: 'https://open.spotify.com/track/zzz' }
    player.update(next, false)
    player.setBusy(false)
    expect(root.querySelector('.track-name')!.textContent).toBe('Another')
  })

  it('still collapses to empty if the switch really ended with nothing playing', () => {
    const root = document.createElement('div')
    const schedule = vi.fn((fn: () => void) => fn())
    const player = buildPlayer(root, cb(), { schedule })
    player.update(TRACK, false)

    player.setBusy(true)
    player.update(null, true)
    player.setBusy(false) // nothing arrived, so the held empty state applies now

    expect(root.querySelector<HTMLDivElement>('.now-bar')!.classList.contains('is-empty')).toBe(true)
    expect(root.querySelector<HTMLAnchorElement>('#now-playing')!.hidden).toBe(true)
  })

  it('renders an empty state immediately when not mid-switch', () => {
    const root = document.createElement('div')
    const player = buildPlayer(root, cb(), NOW)
    player.update(TRACK, false)
    player.update(null, true)
    expect(root.querySelector<HTMLDivElement>('.now-bar')!.classList.contains('is-empty')).toBe(true)
  })
})
