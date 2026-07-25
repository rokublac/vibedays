/** Fallback anchor when no genre is supplied. */
export const ANCHOR = 'lofi'

/**
 * Builds progressively broader queries from an ordered term list — most
 * specific first, then dropping the lowest-priority term each time. A very
 * specific query often matches nothing on Spotify, so the caller walks down
 * this ladder until a rung returns enough playlists.
 *
 * `pinned` words survive every rung. Broadening usually helps, but not always:
 * at 3am a bare "lofi" is no longer a night query at all, while "lofi sleep"
 * still is. Anything pinned is carried down to the last resort.
 */
export function buildQueryLadder(
  terms: string[],
  anchor: string = ANCHOR,
  pinned: string[] = [],
): string[] {
  const base = (anchor && anchor.trim()) || ANCHOR
  const kept = terms.filter((t) => t && t.trim())
  const pin = pinned.filter((p) => p && p.trim()).join(' ')
  // dedupeWords keeps the first occurrence, so a rung whose terms already say
  // "sleep" absorbs the pin instead of repeating it.
  const rung = (body: string) => dedupeWords(pin ? `${body} ${pin}` : body)
  const ladder: string[] = []

  // Drop whole bands from the end: season, then temperature, cloud, rain.
  for (let n = kept.length; n > 0; n--) {
    ladder.push(rung(`${base} ${kept.slice(0, n).join(' ')}`))
  }

  // Then shorten the phase itself, word by word. Without this there is a cliff
  // between "deep house evening chill unwind" and "deep house": genres whose
  // playlists are not named after moods fail every mood rung at once and land
  // on generic results. "deep house evening" is the rung that catches them.
  const phaseWords = (kept[0] ?? '').split(/\s+/).filter(Boolean)
  for (let w = phaseWords.length - 1; w > 0; w--) {
    ladder.push(rung(`${base} ${phaseWords.slice(0, w).join(' ')}`))
  }

  // Bare anchor as the last resort, so there is always something to search.
  ladder.push(rung(base))
  // Pinning rewrites that last resort ("lofi" becomes "lofi sleep"), which
  // could in principle match nothing and leave the walk with no results at all.
  // The plain anchor goes underneath rather than instead: every rung above it
  // still asks for the pinned words, so this only fires when nothing else hit.
  if (pin) ladder.push(dedupeWords(base))
  return [...new Set(ladder)]
}

/**
 * Anchors and phase terms overlap: Ambient ("ambient meditation spa") on a late
 * night ("sleep ambient dreamy") would otherwise search for "ambient" twice.
 * Repeats add nothing to a text match and make the query look broken.
 */
export function dedupeWords(query: string): string {
  const seen = new Set<string>()
  return query
    .split(/\s+/)
    .filter((word) => {
      if (!word) return false
      const key = word.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .join(' ')
}
