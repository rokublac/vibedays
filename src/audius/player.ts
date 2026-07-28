import type { TrackInfo, PlaybackContext } from '../types'
import type { AudiusTrack } from './types'
import { streamUrl } from './search-api'

/**
 * A dead CDN object must not end the session, so a failed track is skipped.
 * But an endless skip loop is worse than an honest error, so consecutive
 * failures are counted and reported once the run gets implausible.
 */
export const MAX_CONSECUTIVE_ERRORS = 5

/**
 * How close to the end of the queue to start asking for more. Requested early
 * rather than on the last track, so the next page has arrived before anyone
 * reaches it and skipping never stalls waiting on the network.
 */
export const PREFETCH_WITHIN = 5

/** An empty WAV. Exists only to give the autoplay unlock something to play. */
export const SILENT_WAV =
  'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAgD4AAAB9AAACABAAZGF0YQAAAAA='

export interface AudiusPlayerCallbacks {
  onState(track: TrackInfo | null, paused: boolean): void
  onError(message: string): void
  /**
   * The queue is running low. Answer with appendQueue, or ignore it and the
   * queue simply loops when it runs out.
   */
  onRunningLow?(): void
}

export interface AudiusPlayerHandle {
  setQueue(tracks: AudiusTrack[]): void
  /** Extend the queue in place, without disturbing what is playing. */
  appendQueue(tracks: AudiusTrack[]): void
  /** The "Playing from" line; the source supplies the mood label. */
  setContext(context: PlaybackContext | null): void
  /** Requests playback. Resolves once asked, not once audible — see load(). */
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

  /**
   * Points the element at the current track and asks it to play.
   *
   * Deliberately does NOT await el.play(): that promise resolves when audio
   * actually begins, which may be seconds away or never — a stalled load or a
   * blocked autoplay leaves it pending. Awaiting it wedged main's busy counter
   * on, disabling every control for the rest of the session. Whether playback
   * really started is reported through the 'playing' and 'error' events, which
   * is what they are for.
   */
  function load(andPlay: boolean): void {
    const t = current()
    if (!t) {
      report()
      return
    }
    el.src = streamUrl(t.id)
    // Reported immediately so the card shows the new track without waiting on
    // the network, then again when the play attempt settles so the play/pause
    // glyph is right. Reporting only once would flash ▶ on every track change.
    report()
    if (!andPlay) return
    // A rejected play() is usually the autoplay policy, not a broken track;
    // the gesture path calls activate() first.
    Promise.resolve(el.play()).then(() => report(), () => report())
  }

  function step(by: number, wrap: boolean): void {
    if (!queue.length) return
    const next = index + by
    if (next < 0) index = 0
    // Looping is the fallback, not the plan: onRunningLow should have topped
    // the queue up well before anyone arrives here.
    else if (next >= queue.length) index = wrap ? 0 : queue.length - 1
    else index = next
    load(true)
    if (queue.length - index <= PREFETCH_WITHIN) cb.onRunningLow?.()
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

    appendQueue(tracks: AudiusTrack[]) {
      // Appended, never replaced: the listener is somewhere in the current
      // queue and replacing it would jump them elsewhere mid-track.
      queue = queue.concat(tracks)
    },

    setContext(next: PlaybackContext | null) {
      context = next
    },

    async play() {
      load(true)
    },

    /**
     * Browsers only unlock audio inside a user gesture, and only if something
     * actually plays. play() on a src-less element rejects, which earns no
     * unlock — that is why the first press used to do nothing and the second
     * one worked. Playing a silent clip gives the unlock something real to
     * happen to; the track is loaded a moment later over the top of it.
     */
    async activate() {
      if (el.src) return // already holding a real track
      try {
        el.src = SILENT_WAV
        await el.play()
        el.pause()
      } catch {
        // Blocked anyway (or no media support). Playback still gets a second
        // chance when the track loads.
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
