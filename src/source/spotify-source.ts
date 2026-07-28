import type { Conditions } from '../types'
import type { Genre } from '../config/genres'
import type { MusicSource, Selection, SourceCallbacks } from './types'
import { createAutoPlaylists } from '../spotify/auto-playlist'
import { searchPlaylists, type SpotifyPlaylist } from '../spotify/search-api'
import { contextUrl, initPlayer as realInitPlayer, type PlayerHandle } from '../spotify/player'
import { playPlaylist, fetchTrackCount, randomStart, setShuffle } from '../spotify/playback-api'

export interface SpotifySourceDeps {
  getToken(): Promise<string | null>
  /** Read at call time, so a genre switch takes effect on the next resolve. */
  genre(): Genre
  callbacks: SourceCallbacks
  /** Injectable for tests; defaults to the real search over the real fetch. */
  search?(query: string, offset?: number): Promise<SpotifyPlaylist[]>
  random?: () => number
  fetchFn?: typeof fetch
  onQuery?(query: string, count: number): void
  /** Injectable for tests; defaults to the real Web Playback SDK. */
  initPlayer?: typeof realInitPlayer
  /** Initial SDK volume, so the first note is already at the listener's level. */
  initialVolume?: number
}

/** A playlist as the rest of the app sees it. */
function toSelection(p: SpotifyPlaylist | null): Selection | null {
  if (!p) return null
  return { id: p.id, label: p.name, url: contextUrl(`spotify:playlist:${p.id}`) }
}

export function createSpotifySource(deps: SpotifySourceDeps): MusicSource {
  const fetchFn = deps.fetchFn ?? fetch

  const search =
    deps.search ??
    (async (query: string, offset?: number) => {
      const token = await deps.getToken()
      if (!token) return []
      return searchPlaylists(token, query, fetchFn, undefined, offset)
    })

  const autoPlaylists = createAutoPlaylists({
    genre: deps.genre,
    search,
    random: deps.random,
    onQuery: deps.onQuery,
  })

  const initPlayer = deps.initPlayer ?? realInitPlayer
  const random = deps.random ?? Math.random

  let player: PlayerHandle | null = null
  let playerInit: Promise<void> | null = null

  /** Initialise the SDK once, sharing one promise between concurrent callers. */
  function ensurePlayer(): Promise<void> {
    if (player) return Promise.resolve()
    if (playerInit) return playerInit
    playerInit = (async () => {
      try {
        player = await initPlayer(
          deps.getToken,
          {
            onState: (track, paused) => deps.callbacks.onState(track, paused),
            onFatal: (kind, message) => deps.callbacks.onFatal(kind, message),
          },
          deps.initialVolume,
        )
      } catch (e) {
        // Allow a later attempt (e.g. after switching to a Premium account)
        // instead of caching a rejected promise forever.
        playerInit = null
        throw e
      }
    })()
    return playerInit
  }

  return {
    id: 'spotify',

    async resolve(c: Conditions) {
      return toSelection(await autoPlaylists.resolve(c))
    },

    async reroll(c: Conditions) {
      return toSelection(await autoPlaylists.reroll(c))
    },

    alternatives(c: Conditions) {
      return autoPlaylists.poolSize(c)
    },

    async activate() {
      await ensurePlayer()
      await player?.activate()
    },

    /**
     * One caller at a time: main guards against a repeat start of the same
     * selection, because that guard has to wrap the crossfade too, and the
     * fade lives there.
     */
    async start(sel: Selection) {
      await ensurePlayer()
      const token = await deps.getToken()
      if (!token || !player) return
      const p = player

      // Start somewhere inside the playlist rather than always on track one,
      // then hand the rest of the queue to Spotify's own shuffle.
      const total = await fetchTrackCount(token, sel.id, fetchFn)
      const position = randomStart(total, random)
      await playPlaylist(token, p.deviceId, sel.id, fetchFn, position)
      void setShuffle(token, p.deviceId, true, fetchFn)
    },

    togglePlay() { player?.togglePlay() },
    next() { player?.next() },
    previous() { player?.previous() },

    async setVolume(v: number) {
      // Before the player exists there is nothing to set; main pushes the
      // stored volume at boot, long before anything plays.
      await player?.setVolume(v)
    },

    async teardown() {
      // Pausing first stops audio immediately; dropping the handle lets a
      // later start build a fresh device.
      try { player?.togglePlay() } catch { /* already gone */ }
      player = null
      playerInit = null
    },
  }
}
