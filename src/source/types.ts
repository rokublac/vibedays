import type { Conditions } from '../types'
import type { TrackInfo } from '../spotify/player'

export type SourceId = 'audius' | 'spotify'

/**
 * What a source picked to play: a Spotify playlist today, an Audius track pool
 * later. Deliberately not a playlist — the free source owns its own queue, so
 * "the thing that is playing" is the only shape both can agree on.
 */
export interface Selection {
  id: string
  /** Shown in the "Playing from" line. */
  label: string
  /** Link out to the source, or null when it has no permalink. */
  url: string | null
}

/**
 * 'account' means the plan cannot stream (Spotify free tier). It is NOT a bad
 * token and must never be treated like one: logging the user out on account
 * failure loops them back to the login screen forever.
 */
export type SourceFailure = 'auth' | 'account' | 'init' | 'network'

export interface SourceCallbacks {
  onState(track: TrackInfo | null, paused: boolean): void
  onFatal(kind: SourceFailure, message: string): void
}

export interface MusicSource {
  readonly id: SourceId

  /** Conditions → something playable. Pinned per condition signature. */
  resolve(c: Conditions): Promise<Selection | null>
  /** A different selection for the same conditions ("Try another"). */
  reroll(c: Conditions): Promise<Selection | null>
  /** Alternatives for these conditions, including the current one. */
  alternatives(c: Conditions): number

  /** Called on the user's play gesture, to unlock audio output. */
  activate(): Promise<void>
  /**
   * Begin playback. The caller has already ramped the volume to 0 — the fade
   * lives in main.ts so the two sources cannot drift apart on it.
   *
   * One caller at a time: main guards against a repeat start of the same
   * selection, because that guard has to wrap the crossfade too.
   */
  start(sel: Selection): Promise<void>

  togglePlay(): void
  next(): void
  previous(): void
  setVolume(v: number): Promise<void>

  /** Stop audio and release the device. Idempotent. */
  teardown(): Promise<void>
}
