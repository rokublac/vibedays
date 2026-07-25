import type { Conditions } from '../types'
import { describeTerms, signature } from '../conditions/descriptors'
import { buildQueryLadder } from '../search/query'
import { rankPlaylists } from '../search/rank'
import type { SpotifyPlaylist } from './search-api'

/** Only the top few results are eligible, so a session varies without drifting. */
export const CANDIDATE_POOL = 5

/** Below this, a query is too narrow to trust and we broaden it. */
export const MIN_RESULTS = 3

export interface AutoPlaylistDeps {
  search(query: string): Promise<SpotifyPlaylist[]>
  /** Injectable for tests; defaults to Math.random. */
  random?: () => number
  onQuery?(query: string, count: number): void
}

export function chooseFrom(
  playlists: SpotifyPlaylist[],
  random: () => number,
): SpotifyPlaylist | null {
  if (!playlists.length) return null
  const pool = playlists.slice(0, CANDIDATE_POOL)
  const i = Math.min(pool.length - 1, Math.floor(random() * pool.length))
  return pool[i]
}

export interface AutoPlaylists {
  resolve(c: Conditions): Promise<SpotifyPlaylist | null>
}

/**
 * Resolves conditions to a playlist by walking the query ladder from most
 * specific to broadest, stopping at the first rung with enough results. The
 * best result seen is kept, so an over-narrow query that returned one decent
 * playlist is not wasted if every broader rung also disappoints.
 *
 * The choice is pinned per exact condition signature for the lifetime of this
 * object, and in-flight searches are shared — render() ticks once a second, so
 * without that a single change would fire a burst of identical requests.
 */
export function createAutoPlaylists(deps: AutoPlaylistDeps): AutoPlaylists {
  const random = deps.random ?? Math.random
  const pinned = new Map<string, SpotifyPlaylist | null>()
  const inFlight = new Map<string, Promise<SpotifyPlaylist | null>>()

  async function walkLadder(c: Conditions): Promise<SpotifyPlaylist | null> {
    let bestClean: SpotifyPlaylist[] = []
    let anything: SpotifyPlaylist[] = []

    for (const query of buildQueryLadder(describeTerms(c))) {
      const found = await deps.search(query)
      // Spotify matches loosely, so drop results advertising weather or a
      // season that is not happening before counting them.
      const { clean } = rankPlaylists(found, c)
      deps.onQuery?.(query, clean.length)

      if (clean.length > bestClean.length) bestClean = clean
      if (found.length > anything.length) anything = found
      if (clean.length >= MIN_RESULTS) return chooseFrom(clean, random)
    }
    // Prefer a thin set of honest matches over a full set of wrong ones.
    return chooseFrom(bestClean.length ? bestClean : anything, random)
  }

  return {
    async resolve(c: Conditions): Promise<SpotifyPlaylist | null> {
      const key = signature(c)
      if (pinned.has(key)) return pinned.get(key)!
      const existing = inFlight.get(key)
      if (existing) return existing

      const request = (async () => {
        try {
          const choice = await walkLadder(c)
          // Only a completed walk is pinned; a thrown search stays retryable.
          pinned.set(key, choice)
          return choice
        } finally {
          inFlight.delete(key)
        }
      })()

      inFlight.set(key, request)
      return request
    },
  }
}
