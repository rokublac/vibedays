import type { Conditions } from '../types'
import type { Genre } from '../config/genres'
import { describeTerms, signature } from '../conditions/descriptors'
import { buildQueryLadder } from '../search/query'
import { rankPlaylists } from '../search/rank'
import type { SpotifyPlaylist } from './search-api'

/** Only the top few results are eligible, so a session varies without drifting. */
export const CANDIDATE_POOL = 5

/** Below this, a query is too narrow to trust and we broaden it. */
export const MIN_RESULTS = 3

/**
 * Extra pages fetched for the winning query only. The search endpoint caps
 * limit at 10, so paging is the only way to widen the pool, and doing it just
 * for the rung that won keeps the ladder itself cheap.
 */
export const EXTRA_PAGES = 2
export const PAGE_SIZE = 10

export interface AutoPlaylistDeps {
  search(query: string, offset?: number): Promise<SpotifyPlaylist[]>
  /** Read at call time, so switching genre takes effect on the next resolve. */
  genre(): Genre
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
  /**
   * Advance to the next candidate for the same conditions. Uses the pool
   * already fetched, so switching costs no API call and never lands back on
   * what is currently playing until the pool wraps.
   */
  reroll(c: Conditions): Promise<SpotifyPlaylist | null>
  /** How many alternatives exist for these conditions, including the current one. */
  poolSize(c: Conditions): number
  /** The query that produced the current pool, or null if nothing is pinned. */
  usedQuery(c: Conditions): string | null
}

interface Pinned {
  pool: SpotifyPlaylist[]
  index: number
  /** The rung that actually produced this pool, for honest reporting. */
  query: string
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
  const pinned = new Map<string, Pinned>()
  const inFlight = new Map<string, Promise<SpotifyPlaylist | null>>()

  // Genre is part of the key: the same evening on Jazz and on Lofi are
  // different pins, and switching back should return to what you had.
  const keyFor = (c: Conditions) => `${deps.genre().id}|${signature(c)}`

  const current = (key: string): SpotifyPlaylist | null => {
    const p = pinned.get(key)
    return p && p.pool.length ? p.pool[p.index] : null
  }

  /** Pulls further pages for one query, ignoring pages that fail or repeat. */
  async function widen(
    query: string,
    first: SpotifyPlaylist[],
    c: Conditions,
  ): Promise<SpotifyPlaylist[]> {
    const seen = new Set(first.map((p) => p.id))
    const out = [...first]
    for (let page = 1; page <= EXTRA_PAGES; page++) {
      let found: SpotifyPlaylist[]
      try {
        found = await deps.search(query, page * PAGE_SIZE)
      } catch {
        break // a failed extra page is not worth failing the whole resolve over
      }
      if (!found.length) break
      for (const p of rankPlaylists(found, c).clean) {
        if (seen.has(p.id)) continue
        seen.add(p.id)
        out.push(p)
      }
    }
    return out
  }

  async function walkLadder(c: Conditions): Promise<{ pool: SpotifyPlaylist[]; query: string }> {
    const ladder = buildQueryLadder(describeTerms(c), deps.genre().anchor)
    let best: { pool: SpotifyPlaylist[]; query: string } = { pool: [], query: ladder[0] }
    let anything: { pool: SpotifyPlaylist[]; query: string } = { pool: [], query: ladder[0] }

    for (const query of ladder) {
      const found = await deps.search(query)
      // Spotify matches loosely, so drop results advertising weather or a
      // season that is not happening before counting them.
      const { clean } = rankPlaylists(found, c)
      deps.onQuery?.(query, clean.length)

      if (clean.length > best.pool.length) best = { pool: clean, query }
      if (found.length > anything.pool.length) anything = { pool: found, query }
      if (clean.length >= MIN_RESULTS) {
        return { pool: await widen(query, clean, c), query }
      }
    }
    // Prefer a thin set of honest matches over a full set of wrong ones.
    return best.pool.length ? best : anything
  }

  return {
    async resolve(c: Conditions): Promise<SpotifyPlaylist | null> {
      const key = keyFor(c)
      if (pinned.has(key)) return current(key)
      const existing = inFlight.get(key)
      if (existing) return existing

      const request = (async () => {
        try {
          const { pool, query } = await walkLadder(c)
          // Start somewhere in the top candidates so sessions differ, then
          // reroll walks the whole pool from there.
          const start = pool.length
            ? Math.min(pool.length - 1, Math.floor(random() * Math.min(pool.length, CANDIDATE_POOL)))
            : 0
          // Only a completed walk is pinned; a thrown search stays retryable.
          pinned.set(key, { pool, index: start, query })
          return current(key)
        } finally {
          inFlight.delete(key)
        }
      })()

      inFlight.set(key, request)
      return request
    },

    async reroll(c: Conditions): Promise<SpotifyPlaylist | null> {
      const key = keyFor(c)
      // Nothing cached yet (or a bare pool): fall back to a normal resolve.
      const p = pinned.get(key)
      if (!p || p.pool.length <= 1) return this.resolve(c)
      p.index = (p.index + 1) % p.pool.length
      return current(key)
    },

    poolSize(c: Conditions): number {
      return pinned.get(keyFor(c))?.pool.length ?? 0
    },

    usedQuery(c: Conditions): string | null {
      return pinned.get(keyFor(c))?.query ?? null
    },
  }
}
