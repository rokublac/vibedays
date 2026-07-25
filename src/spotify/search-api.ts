export interface SpotifyPlaylist {
  id: string
  name: string
  owner: string
}

/**
 * Spotify locked down its own editorial and algorithmic playlists in Nov 2024:
 * apps registered after the cutoff get 404 when they try to use them. Search
 * still returns them, so they have to be dropped here or playback fails.
 */
const BLOCKED_OWNER = 'spotify'

interface RawPlaylist {
  id?: unknown
  name?: unknown
  owner?: { id?: unknown } | null
}

/**
 * Search responses contain null holes and, since 2024, entries missing the
 * fields they claim to have — so every item is validated rather than trusted.
 */
export function usablePlaylists(items: unknown): SpotifyPlaylist[] {
  if (!Array.isArray(items)) return []
  const out: SpotifyPlaylist[] = []
  for (const item of items) {
    if (!item || typeof item !== 'object') continue
    const p = item as RawPlaylist
    const owner = p.owner?.id
    if (typeof p.id !== 'string' || !p.id) continue
    if (typeof p.name !== 'string' || !p.name) continue
    if (typeof owner !== 'string' || owner.toLowerCase() === BLOCKED_OWNER) continue
    out.push({ id: p.id, name: p.name, owner })
  }
  return out
}

/**
 * /v1/search caps limit at 10 — asking for more is a 400, not a clamp.
 * Ten is ample: only the top CANDIDATE_POOL are eligible anyway.
 */
export const MAX_SEARCH_LIMIT = 10

export async function searchPlaylists(
  token: string,
  query: string,
  fetchFn: typeof fetch = fetch,
  limit = MAX_SEARCH_LIMIT,
  offset = 0,
): Promise<SpotifyPlaylist[]> {
  const capped = Math.max(1, Math.min(MAX_SEARCH_LIMIT, limit))
  const from = Math.max(0, Math.floor(offset))
  const url =
    'https://api.spotify.com/v1/search' +
    `?q=${encodeURIComponent(query)}&type=playlist&limit=${capped}&offset=${from}`
  const res = await fetchFn(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    // Spotify explains the rejection in the body; without it a 400 is a guessing game.
    const detail = await res.text().catch(() => '')
    throw new Error(`playlist search failed: ${res.status}${detail ? ` — ${detail}` : ''}`)
  }
  const data = (await res.json()) as { playlists?: { items?: unknown } | null }
  return usablePlaylists(data.playlists?.items)
}
