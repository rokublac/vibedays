import type { Conditions, SunPhase, WeatherKind } from '../types'
import type { Genre } from '../config/genres'

export interface AudiusQuery {
  genre?: string
  mood?: string
  query?: string
}

/** Audius genres for the app's five. Synthwave is absent and goes by text. */
const GENRE_MAP: Record<string, AudiusQuery> = {
  lofi: { genre: 'Lo-Fi' },
  jazz: { genre: 'Jazz' },
  classical: { genre: 'Classical' },
  ambient: { genre: 'Ambient' },
  // Not an Audius genre. Free text hits retrowave; genre=Electronic did not —
  // it returned generic electronic instead.
  synthwave: { query: 'synthwave' },
}

const BY_WEATHER: Partial<Record<WeatherKind, string>> = {
  storm: 'Brooding',
  fog: 'Brooding',
  rain: 'Melancholy',
  snow: 'Tender',
  cloudy: 'Sentimental',
}

const BY_PHASE: Record<SunPhase, string> = {
  'late-night': 'Peaceful',
  'deep-night': 'Peaceful',
  dawn: 'Tender',
  'sunrise-golden': 'Yearning',
  morning: 'Easygoing',
  midday: 'Upbeat',
  afternoon: 'Easygoing',
  'sunset-golden': 'Romantic',
  'blue-hour': 'Sophisticated',
  evening: 'Cool',
}

/** Phases where sleep matters more than the sky. */
const NIGHT: SunPhase[] = ['late-night', 'deep-night']

/**
 * Three layers, most specific first. Night beats weather because
 * descriptors.ts already pins "sleep" at late night — the app's own position is
 * that sleep outranks conditions. Weather beats the hour otherwise, since rain
 * changes the feel of a day more than the clock does. A clear sky says nothing
 * the hour has not already said, so it is absent from BY_WEATHER.
 */
export function moodFor(c: Conditions): string {
  if (NIGHT.includes(c.phase)) return BY_PHASE[c.phase]
  const byWeather = c.weather ? BY_WEATHER[c.weather] : undefined
  return byWeather ?? BY_PHASE[c.phase]
}

export function audiusQuery(c: Conditions, genre: Genre): AudiusQuery {
  return { ...(GENRE_MAP[genre.id] ?? GENRE_MAP.lofi), mood: moodFor(c) }
}
