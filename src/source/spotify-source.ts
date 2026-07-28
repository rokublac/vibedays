import type { Conditions } from '../types'
import type { Genre } from '../config/genres'
import type { MusicSource, Selection, SourceCallbacks } from './types'
import { createAutoPlaylists } from '../spotify/auto-playlist'
import { searchPlaylists, type SpotifyPlaylist } from '../spotify/search-api'
import { contextUrl } from '../spotify/player'

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

    // Playback arrives in the next task.
    activate: () => { throw new Error('not implemented') },
    start: () => { throw new Error('not implemented') },
    togglePlay: () => { throw new Error('not implemented') },
    next: () => { throw new Error('not implemented') },
    previous: () => { throw new Error('not implemented') },
    setVolume: () => { throw new Error('not implemented') },
    teardown: () => { throw new Error('not implemented') },
  }
}
