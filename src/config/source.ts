import type { SourceId } from '../source/types'

/**
 * Spotify for now, so existing listeners see no change. Phase 3 flips this to
 * the free source and makes signing in opt-in.
 */
export const DEFAULT_SOURCE: SourceId = 'spotify'

const STORAGE_KEY = 'hb_source'
const KNOWN: SourceId[] = ['spotify', 'audius']

export function loadSource(): SourceId {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) as SourceId | null
    return raw && KNOWN.includes(raw) ? raw : DEFAULT_SOURCE
  } catch {
    // Private browsing can throw on storage access; the default still works.
    return DEFAULT_SOURCE
  }
}

export function saveSource(id: SourceId): void {
  try {
    localStorage.setItem(STORAGE_KEY, id)
  } catch {
    // Not remembering the choice is not worth breaking playback over.
  }
}
