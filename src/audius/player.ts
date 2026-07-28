import type { TrackInfo, PlaybackContext } from '../spotify/player'
import type { AudiusTrack } from './types'
import { streamUrl } from './search-api'

/**
 * A dead CDN object must not end the session, so a failed track is skipped.
 * But an endless skip loop is worse than an honest error, so consecutive
 * failures are counted and reported once the run gets implausible.
 */
export const MAX_CONSECUTIVE_ERRORS = 5

export interface AudiusPlayerCallbacks {
  onState(track: TrackInfo | null, paused: boolean): void
  onError(message: string): void
}

export interface AudiusPlayerHandle {
  setQueue(tracks: AudiusTrack[]): void
  /** The "Playing from" line; the source supplies the mood label. */
  setContext(context: PlaybackContext | null): void
  play(): Promise<void>
  activate(): Promise<void>
  togglePlay(): void
  next(): void
  previous(): void
  setVolume(v: number): Promise<void>
  teardown(): Promise<void>
}

export function createAudiusPlayer(
  cb: AudiusPlayerCallbacks,
  el: HTMLAudioElement = new Audio(),
): AudiusPlayerHandle {
  let queue: AudiusTrack[] = []
  let index = 0
  let context: PlaybackContext | null = null
  let consecutiveErrors = 0

  const current = (): AudiusTrack | null => queue[index] ?? null

  function toTrackInfo(t: AudiusTrack): TrackInfo {
    return {
      name: t.title,
      artists: t.artist,
      artworkUrl: t.artworkUrl,
      url: t.permalink ? `https://audius.co${t.permalink}` : null,
      context,
    }
  }

  function report() {
    const t = current()
    cb.onState(t ? toTrackInfo(t) : null, el.paused)
  }

  /** Points the element at the current track. Playing is the caller's choice. */
  function load(andPlay: boolean): Promise<void> {
    const t = current()
    if (!t) {
      report()
      return Promise.resolve()
    }
    el.src = streamUrl(t.id)
    // Reported twice on purpose: once now so the card shows the new track
    // immediately, and again once play() settles so the play/pause glyph is
    // right. Reporting only before would flash ▶ on every track change.
    report()
    if (!andPlay) return Promise.resolve()
    // A rejected play() is usually the autoplay policy, not a broken track;
    // the gesture path calls activate() first.
    return Promise.resolve(el.play()).catch(() => {}).then(() => report())
  }

  function step(by: number, wrap: boolean): void {
    if (!queue.length) return
    const next = index + by
    if (next < 0) index = 0
    else if (next >= queue.length) index = wrap ? 0 : queue.length - 1
    else index = next
    void load(true)
  }

  el.addEventListener('ended', () => step(1, true))

  el.addEventListener('error', () => {
    if (!queue.length) return
    consecutiveErrors++
    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      consecutiveErrors = 0
      cb.onError('several tracks in a row could not be played')
      return
    }
    step(1, true)
  })

  // Any track that actually starts clears the run of failures.
  el.addEventListener('playing', () => {
    consecutiveErrors = 0
    report()
  })
  el.addEventListener('pause', () => report())

  return {
    setQueue(tracks: AudiusTrack[]) {
      queue = tracks
      index = 0
      consecutiveErrors = 0
    },

    setContext(next: PlaybackContext | null) {
      context = next
    },

    play() {
      return load(true)
    },

    /**
     * Browsers only unlock audio inside a user gesture. Calling play() on the
     * silent, empty element during the click is enough to earn that unlock.
     */
    async activate() {
      try {
        await el.play()
        el.pause()
      } catch {
        // Nothing loaded yet is fine; the unlock still counts.
      }
    },

    togglePlay() {
      if (el.paused) void Promise.resolve(el.play()).catch(() => {})
      else el.pause()
    },

    next() { step(1, true) },
    previous() { step(-1, false) },

    async setVolume(v: number) {
      el.volume = Math.min(1, Math.max(0, v))
    },

    async teardown() {
      el.pause()
      el.src = ''
      queue = []
      index = 0
    },
  }
}
