import type { Conditions } from '../types'
import type { Genre } from '../config/genres'
import type { MusicSource, Selection, SourceCallbacks } from './types'
import type { AudiusTrack } from '../audius/types'
import type { SearchParams } from '../audius/search-api'
import { createTrackPool, type TrackPool } from '../audius/pool'
import { createAudiusPlayer, type AudiusPlayerHandle } from '../audius/player'
import { audiusQuery } from '../audius/mood-map'

export interface AudiusSourceDeps {
  /** Read at call time, so a genre switch takes effect on the next resolve. */
  genre(): Genre
  callbacks: SourceCallbacks
  search?(p: SearchParams): Promise<AudiusTrack[]>
  random?: () => number
  fetchFn?: typeof fetch
  /** Injectable for tests; defaults to a fresh Audio element. */
  audio?: HTMLAudioElement
}

export function createAudiusSource(deps: AudiusSourceDeps): MusicSource {
  const pool: TrackPool = createTrackPool({
    search: deps.search,
    genre: deps.genre,
    random: deps.random,
    fetchFn: deps.fetchFn,
  })

  /**
   * Pages deeper for the same vibe so skipping never runs out and never loops
   * back to tracks already heard. Failures are swallowed: the queue still has
   * what it had, so the listener notices nothing.
   */
  async function extend(): Promise<void> {
    if (extending || !playing) return
    extending = true
    try {
      const more = await pool.advance(playing)
      if (more.length) player.appendQueue(more)
    } catch {
      // Out of pages or offline; the existing queue loops rather than stopping.
    } finally {
      extending = false
    }
  }

  const player: AudiusPlayerHandle = createAudiusPlayer(
    {
      onState: (track, paused) => deps.callbacks.onState(track, paused),
      onError: (message) => deps.callbacks.onFatal('network', message),
      onRunningLow: () => void extend(),
    },
    deps.audio,
  )

  /** Tracks for the selection main last asked us to start. */
  let staged: AudiusTrack[] = []
  /** What is playing, so the queue can be topped up for the same vibe. */
  let playing: Conditions | null = null
  /** One page request at a time; onRunningLow fires on every skip near the end. */
  let extending = false

  /**
   * The offset is part of the id so a reroll produces a distinct selection —
   * main's startingId guard drops a repeat start of the same id, which would
   * otherwise make "Try another" appear to do nothing.
   */
  function selectionFor(c: Conditions, tracks: AudiusTrack[]): Selection | null {
    if (!tracks.length) return null
    const q = audiusQuery(c, deps.genre())
    // Both night phases search the Ambient genre at the Peaceful mood, so the
    // text is what tells "sleep ambient" from "zen meditation" — without it
    // the two would share an id and read as the same selection.
    return {
      id: `${q.genre ?? ''}|${q.query ?? ''}|${q.mood}|${pool.offset(c)}`,
      label: q.label ?? '',
      url: null,
    }
  }

  /** A search failure is reported, not thrown: the tick will try again. */
  async function attempt(
    c: Conditions,
    get: () => Promise<AudiusTrack[]>,
  ): Promise<Selection | null> {
    try {
      const tracks = await get()
      staged = tracks
      return selectionFor(c, tracks)
    } catch (e) {
      deps.callbacks.onFatal('network', e instanceof Error ? e.message : String(e))
      return null
    }
  }

  return {
    id: 'audius',

    resolve(c: Conditions) {
      playing = c
      return attempt(c, () => pool.resolve(c))
    },

    activate() {
      return player.activate()
    },

    async start(sel: Selection) {
      player.setContext({ label: sel.label, url: null })
      player.setQueue(staged)
      await player.play()
    },

    togglePlay() { player.togglePlay() },
    next() { player.next() },
    previous() { player.previous() },

    setVolume(v: number) {
      return player.setVolume(v)
    },

    async teardown() {
      staged = []
      playing = null
      await player.teardown()
    },
  }
}
