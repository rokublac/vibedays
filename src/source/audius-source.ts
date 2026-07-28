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

/** "Cool lofi" — what the "Playing from" line says in place of a playlist. */
function labelFor(c: Conditions, genre: Genre): string {
  const { mood } = audiusQuery(c, genre)
  return `${mood} ${genre.label.toLowerCase()}`
}

export function createAudiusSource(deps: AudiusSourceDeps): MusicSource {
  const pool: TrackPool = createTrackPool({
    search: deps.search,
    genre: deps.genre,
    random: deps.random,
    fetchFn: deps.fetchFn,
  })

  const player: AudiusPlayerHandle = createAudiusPlayer(
    {
      onState: (track, paused) => deps.callbacks.onState(track, paused),
      // Never 'auth': this source has no token, so a failure here must not
      // send a signed-out listener to the login card.
      onError: (message) => deps.callbacks.onFatal('network', message),
    },
    deps.audio,
  )

  /** Tracks for the selection main last asked us to start. */
  let staged: AudiusTrack[] = []

  /**
   * The offset is part of the id so a reroll produces a distinct selection —
   * main's startingId guard drops a repeat start of the same id, which would
   * otherwise make "Try another" appear to do nothing.
   */
  function selectionFor(c: Conditions, tracks: AudiusTrack[]): Selection | null {
    if (!tracks.length) return null
    const genre = deps.genre()
    const q = audiusQuery(c, genre)
    return {
      id: `${q.genre ?? q.query}|${q.mood}|${pool.offset(c)}`,
      label: labelFor(c, genre),
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
      return attempt(c, () => pool.resolve(c))
    },

    reroll(c: Conditions) {
      return attempt(c, () => pool.advance(c))
    },

    alternatives(c: Conditions) {
      return pool.size(c)
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
      await player.teardown()
    },
  }
}
