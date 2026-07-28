/**
 * Playback volume, kept here rather than as a constant in the fade module so
 * the listener can change it and have it survive a reload.
 */

/** Where the level starts before anyone touches it. */
export const DEFAULT_VOLUME = 0.6

export interface VolumeState {
  /** 0..1, independent of mute — muting does not discard it. */
  level: number
  muted: boolean
}

const STORAGE_KEY = 'hb_volume'

export function clampLevel(n: number): number {
  // A NaN reaching player.setVolume silences playback with no error, so a
  // non-number is treated as "never set" rather than passed through.
  if (typeof n !== 'number' || !Number.isFinite(n)) return DEFAULT_VOLUME
  return Math.min(1, Math.max(0, n))
}

/** What actually reaches the SDK: mute is a veto, not a lost level. */
export function effective(s: VolumeState): number {
  return s.muted ? 0 : s.level
}

export function loadVolume(): VolumeState {
  const fallback: VolumeState = { level: DEFAULT_VOLUME, muted: false }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return fallback
    const v = JSON.parse(raw) as Partial<VolumeState> | null
    if (!v || typeof v !== 'object' || Array.isArray(v)) return fallback
    if (typeof v.level !== 'number') return fallback
    return { level: clampLevel(v.level), muted: v.muted === true }
  } catch {
    // Unparseable or unavailable storage is the same as never having set it.
    return fallback
  }
}

export function saveVolume(s: VolumeState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    // Not remembering the level is not worth breaking playback over.
  }
}
