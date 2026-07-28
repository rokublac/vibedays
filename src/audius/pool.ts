import type { Conditions } from '../types'
import type { Genre } from '../config/genres'
import type { AudiusTrack } from './types'
import { signature } from '../conditions/descriptors'
import { audiusQuery } from './mood-map'
import { PAGE_SIZE, searchTracks, type SearchParams } from './search-api'

export interface TrackPoolDeps {
  search?(p: SearchParams): Promise<AudiusTrack[]>
  /** Read at call time, so a genre switch takes effect on the next resolve. */
  genre(): Genre
  random?: () => number
  fetchFn?: typeof fetch
}

export interface TrackPool {
  resolve(c: Conditions): Promise<AudiusTrack[]>
  /** Page deeper for a fresh batch of the same mood. */
  advance(c: Conditions): Promise<AudiusTrack[]>
  size(c: Conditions): number
  /** The offset the current pool came from, for the selection id. */
  offset(c: Conditions): number
}

interface Pinned {
  tracks: AudiusTrack[]
  offset: number
}

/** Fisher-Yates, so two listeners on the same conditions do not lock step. */
function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(random() * (i + 1)))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * Mirrors auto-playlist.ts: pinned per exact condition signature, with
 * in-flight requests shared — render() ticks once a second, so without that a
 * single change would fire a burst of identical searches.
 */
export function createTrackPool(deps: TrackPoolDeps): TrackPool {
  const random = deps.random ?? Math.random
  const search = deps.search ?? ((p: SearchParams) => searchTracks(p, deps.fetchFn))
  const pinned = new Map<string, Pinned>()
  const inFlight = new Map<string, Promise<AudiusTrack[]>>()

  // Genre is part of the key: the same evening on Jazz and on Lofi are
  // different pins, and switching back should return to what you had.
  const keyFor = (c: Conditions) => `${deps.genre().id}|${signature(c)}`

  async function fetchAt(c: Conditions, offset: number): Promise<AudiusTrack[]> {
    const tracks = shuffle(await search({ ...audiusQuery(c, deps.genre()), offset }), random)
    pinned.set(keyFor(c), { tracks, offset })
    return tracks
  }

  return {
    async resolve(c: Conditions): Promise<AudiusTrack[]> {
      const key = keyFor(c)
      const have = pinned.get(key)
      if (have) return have.tracks
      const existing = inFlight.get(key)
      if (existing) return existing

      const request = (async () => {
        try {
          return await fetchAt(c, 0)
        } finally {
          inFlight.delete(key)
        }
      })()
      inFlight.set(key, request)
      return request
    },

    async advance(c: Conditions): Promise<AudiusTrack[]> {
      const key = keyFor(c)
      const have = pinned.get(key)
      const next = (have?.offset ?? 0) + PAGE_SIZE
      const tracks = await fetchAt(c, next)
      // Running off the end of the catalogue must not leave an empty queue and
      // silence, so wrap rather than hand back nothing.
      if (!tracks.length) return fetchAt(c, 0)
      return tracks
    },

    size(c: Conditions): number {
      return pinned.get(keyFor(c))?.tracks.length ?? 0
    },

    offset(c: Conditions): number {
      return pinned.get(keyFor(c))?.offset ?? 0
    },
  }
}
