import type { Conditions, SunPhase, WeatherKind } from '../types'
import type { Genre } from '../config/genres'

export interface AudiusQuery {
  genre?: string
  mood?: string
  query?: string
  /** What the "Playing from" line says. */
  label?: string
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

/**
 * After dark the chill genres stop meaning "beats" and start meaning "help me
 * sleep", so the genre filter itself moves — measured, not assumed: Lo-Fi +
 * Peaceful in the small hours returns hip-hop instrumentals ("Corvette
 * Cassette Remix", "Droplet"), while Ambient + Peaceful + "zen meditation"
 * returns "Zen Meditation" and "Deep Zen and Space Meditation".
 *
 * Only the two background-chill genres are overridden. Someone who picked Jazz
 * at 2am wants late-night jazz, not a meditation track.
 */
const NIGHT_QUERY: Partial<Record<SunPhase, AudiusQuery>> = {
  // 22:00–midnight: winding down, not yet asleep.
  'late-night': { genre: 'Ambient', query: 'sleep ambient', label: 'Sleep ambient' },
  // The small hours: as deep as it goes.
  'deep-night': { genre: 'Ambient', query: 'zen meditation', label: 'Zen meditation' },
}

const SLEEPS_AT_NIGHT = ['lofi', 'ambient']

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
  const mood = moodFor(c)
  const night = SLEEPS_AT_NIGHT.includes(genre.id) ? NIGHT_QUERY[c.phase] : undefined
  if (night) return { ...night, mood }
  const base = GENRE_MAP[genre.id] ?? GENRE_MAP.lofi
  // "Cool lofi", "Melancholy jazz" — the mood plus what you picked.
  return { ...base, mood, label: `${mood} ${genre.label.toLowerCase()}` }
}
