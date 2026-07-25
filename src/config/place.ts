import type { Coords } from '../types'

/**
 * A city the user typed, kept so they are not asked again on every reload.
 * Only used when geolocation is denied or unavailable.
 */
export interface SavedPlace {
  name: string
  coords: Coords
}

const STORAGE_KEY = 'hb_place'

export function loadPlace(): SavedPlace | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as Partial<SavedPlace>
    if (typeof p.name !== 'string' || !p.name) return null
    const lat = p.coords?.latitude
    const lon = p.coords?.longitude
    if (typeof lat !== 'number' || typeof lon !== 'number') return null
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
    return { name: p.name, coords: { latitude: lat, longitude: lon } }
  } catch {
    // Unparseable or unavailable storage is the same as having no place saved.
    return null
  }
}

export function savePlace(place: SavedPlace): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(place))
  } catch {
    // Not remembering the city is not worth breaking playback over.
  }
}

export function clearPlace(): void {
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch { /* nothing to do */ }
}
