import type { Conditions } from '../types'
import type { SpotifyPlaylist } from '../spotify/search-api'

/**
 * Spotify's playlist search is a loose text match, so a query for
 * "lofi deep night sleep" happily returns "lofi sleep, lofi rain" on a clear
 * night. We can't change what it matches, but we can decline to pick results
 * whose names advertise conditions that are not happening.
 */
export function contradictions(c: Conditions): string[] {
  const out: string[] = []

  // Weather that is not currently happening.
  const raining = c.precip === 'sprinkle' || c.precip === 'drizzle'
    || c.precip === 'steady' || c.precip === 'downpour'
  if (!raining) out.push('rain', 'rainy', 'raining')
  if (c.precip !== 'snowing') out.push('snow', 'snowy', 'snowfall')
  if (c.precip !== 'downpour' && c.weather !== 'storm') out.push('storm', 'stormy', 'thunder')
  if (c.cloud === 'clear' || c.cloud === 'hazy') out.push('overcast', 'foggy', 'fog')

  // The other three seasons.
  for (const s of ['spring', 'summer', 'autumn', 'winter']) {
    if (s !== c.season) out.push(s)
  }
  if (c.season !== 'autumn') out.push('fall')

  // Broad daypart mismatch. Kept deliberately coarse: these are the words that
  // would make a playlist obviously wrong, not merely a slightly odd fit.
  const nightish = c.phase === 'late-night' || c.phase === 'deep-night'
    || c.phase === 'evening' || c.phase === 'blue-hour' || c.phase === 'dawn'
  if (nightish) out.push('morning', 'sunny', 'daylight', 'wake up')
  // Only the daylight phases; 3am playlists are right at 3am.
  else out.push('midnight', 'insomnia', '3am', 'sleep')

  return out
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Whole-word, case-insensitive, so "rainbow" does not count as "rain". */
export function nameContradicts(name: string, words: string[]): boolean {
  if (!words.length) return false
  const pattern = new RegExp(`(^|[^a-z0-9])(${words.map(escape).join('|')})([^a-z0-9]|$)`, 'i')
  return pattern.test(name)
}

export interface RankedPlaylists {
  clean: SpotifyPlaylist[]
  contradicting: SpotifyPlaylist[]
}

/**
 * Splits rather than filters: if every result contradicts, something is better
 * than silence, so the caller can still fall back to the rejected pile.
 */
export function rankPlaylists(playlists: SpotifyPlaylist[], c: Conditions): RankedPlaylists {
  const words = contradictions(c)
  const clean: SpotifyPlaylist[] = []
  const contradicting: SpotifyPlaylist[] = []
  for (const p of playlists) {
    if (nameContradicts(p.name, words)) contradicting.push(p)
    else clean.push(p)
  }
  return { clean, contradicting }
}
