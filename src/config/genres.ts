export interface Genre {
  id: string
  label: string
}

/**
 * What the picker offers. How each one is actually searched for lives in
 * audius/mood-map.ts, which maps these ids onto Audius genres.
 *
 * Every one here has a real Audius genre behind it. Synthwave did not, so it
 * had to spend the single text slot naming itself, leaving no room for the
 * hour's vibe word — it never got sleep music at night or "neon" at blue hour,
 * and barely followed the conditions at all.
 */
export const GENRES: Genre[] = [
  { id: 'lofi', label: 'Lofi' },
  { id: 'jazz', label: 'Jazz' },
  { id: 'classical', label: 'Classical' },
  { id: 'ambient', label: 'Ambient' },
]

export const DEFAULT_GENRE_ID = 'lofi'

const STORAGE_KEY = 'hb_genre'

export function genreById(id: string | null | undefined): Genre {
  return GENRES.find((g) => g.id === id) ?? GENRES.find((g) => g.id === DEFAULT_GENRE_ID)!
}

export function loadGenre(): Genre {
  try {
    return genreById(localStorage.getItem(STORAGE_KEY))
  } catch {
    // Private browsing can throw on storage access; the default still works.
    return genreById(DEFAULT_GENRE_ID)
  }
}

export function saveGenre(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // Not being able to remember the choice is not worth breaking playback over.
  }
}
