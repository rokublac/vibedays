const API = 'https://api.spotify.com/v1'

const auth = (token: string) => ({ Authorization: `Bearer ${token}` })

/**
 * Starts a playlist. Without `position` Spotify always begins at track one, so
 * the same playlist opens with the same song every time.
 */
export async function playPlaylist(
  token: string,
  deviceId: string,
  playlistId: string,
  fetchFn: typeof fetch = fetch,
  position?: number,
): Promise<void> {
  const body: Record<string, unknown> = { context_uri: `spotify:playlist:${playlistId}` }
  if (typeof position === 'number' && position > 0) body.offset = { position }

  const res = await fetchFn(`${API}/me/player/play?device_id=${encodeURIComponent(deviceId)}`, {
    method: 'PUT',
    headers: { ...auth(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`play request failed: ${res.status}`)
}

/**
 * How many tracks the playlist has, so a start position can be chosen inside
 * it. `fields` keeps the response tiny. Null when it cannot be determined, in
 * which case playback simply starts at the beginning.
 */
export async function fetchTrackCount(
  token: string,
  playlistId: string,
  fetchFn: typeof fetch = fetch,
): Promise<number | null> {
  try {
    const url = `${API}/playlists/${encodeURIComponent(playlistId)}?fields=tracks(total)`
    const res = await fetchFn(url, { headers: auth(token) })
    if (!res.ok) return null
    const data = (await res.json()) as { tracks?: { total?: unknown } }
    const total = data.tracks?.total
    return typeof total === 'number' && total > 0 ? total : null
  } catch {
    return null
  }
}

/** A start index inside the playlist, or undefined when there is no choice to make. */
export function randomStart(total: number | null, random: () => number): number | undefined {
  if (!total || total <= 1) return undefined
  // Guard the 1.0 edge: offset must stay below total or Spotify rejects it.
  return Math.min(total - 1, Math.floor(random() * total))
}

/**
 * Best-effort: shuffle needs an active device, and it is not worth failing a
 * successful play over. Applied after playback starts, which keeps the random
 * first track and shuffles everything after it.
 */
export async function setShuffle(
  token: string,
  deviceId: string,
  state: boolean,
  fetchFn: typeof fetch = fetch,
): Promise<boolean> {
  try {
    const url =
      `${API}/me/player/shuffle?state=${state}&device_id=${encodeURIComponent(deviceId)}`
    const res = await fetchFn(url, { method: 'PUT', headers: auth(token) })
    return res.ok
  } catch {
    return false
  }
}
