export interface Genre {
  id: string
  label: string
  /** Replaces the anchor in every search query. */
  anchor: string
}

/**
 * "Zen"/spa music is not a Spotify genre name; that space is tagged ambient,
 * new age, meditation or spa, so Ambient searches for all of it at once.
 */
/**
 * Two rules for anchors, both enforced by tests in ui/genre.test.ts:
 * they must not repeat a word internally, since the query builder
 * de-duplicates and would silently shorten them; and they must not contain a
 * weather or season word, or the result ranker would reject its own matches.
 */
export const GENRES: Genre[] = [
  { id: 'lofi', label: 'Lofi', anchor: 'lofi' },
  { id: 'synthwave', label: 'Synthwave', anchor: 'synthwave retrowave' },
  { id: 'jazz', label: 'Jazz', anchor: 'jazz' },
  // Back to a bare anchor now Piano is gone: "orchestral" only existed to keep
  // the two apart, and it was narrowing every rung for no reason.
  { id: 'classical', label: 'Classical', anchor: 'classical' },
  { id: 'ambient', label: 'Ambient', anchor: 'ambient meditation spa' },
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
