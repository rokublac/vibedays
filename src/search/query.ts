/** Every query is anchored on the genre; the app is a lofi player. */
export const ANCHOR = 'lofi'

/**
 * Builds progressively broader queries from an ordered term list — most
 * specific first, then dropping the lowest-priority term each time. A very
 * specific query often matches nothing on Spotify, so the caller walks down
 * this ladder until a rung returns enough playlists.
 */
export function buildQueryLadder(terms: string[]): string[] {
  const kept = terms.filter((t) => t && t.trim())
  const ladder: string[] = []
  for (let n = kept.length; n > 0; n--) {
    ladder.push(`${ANCHOR} ${kept.slice(0, n).join(' ')}`)
  }
  // Bare anchor as the last resort, so there is always something to search.
  ladder.push(ANCHOR)
  return ladder
}
