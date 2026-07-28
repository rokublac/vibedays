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
  // The small hours: as deep as it goes. Not "zen" — measured, that word pulls
  // toward spa and yoga ("Spa Meditation", "Ambient Music for Yoga"), which is
  // daytime wellness music. "sleep music" returns actual sleep aid.
  'deep-night': { genre: 'Ambient', query: 'sleep music', label: 'Sleep music' },
}

const SLEEPS_AT_NIGHT = ['lofi', 'ambient']

/**
 * Search words that actually exist in track titles. Measured across the
 * catalogue, and most weather words do not: "storm" and "fog" return nothing,
 * "snow" five, "clouds" three. Only rain is written about often enough to
 * search for, so only rain gets a word.
 */
const WEATHER_TEXT: Partial<Record<WeatherKind, string>> = {
  rain: 'rain',
}

/**
 * Weather with no usable search word still has to be felt, so it takes over
 * the mood instead. This is the old behaviour, kept only where text cannot do
 * the job.
 */
const WEATHER_MOOD: Partial<Record<WeatherKind, string>> = {
  storm: 'Brooding',
  fog: 'Brooding',
  snow: 'Tender',
  cloudy: 'Sentimental',
}

/**
 * Phase words with a healthy pool. Only two survive: "morning" (34) and
 * "night" (25). "sunrise", "midday" and "dusk" return nothing, and combining
 * two words collapses the pool ("rain morning" returns one track), so a
 * weather word always wins over a phase word.
 */
const PHASE_TEXT: Partial<Record<SunPhase, string>> = {
  morning: 'morning',
  evening: 'night',
}

/**
 * Moods that do not survive being paired with a weather word: Upbeat + rain
 * is two tracks, Sophisticated + rain is four. Rain is not upbeat anyway, so
 * these soften rather than fight the weather.
 */
const DAMPENED: Record<string, string> = {
  Upbeat: 'Sentimental',
  Sophisticated: 'Sentimental',
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
/** The word searched for alongside the genre, or none. Weather beats hour. */
export function textFor(c: Conditions): string | undefined {
  const weather = c.weather ? WEATHER_TEXT[c.weather] : undefined
  return weather ?? PHASE_TEXT[c.phase]
}

export function moodFor(c: Conditions): string {
  if (NIGHT.includes(c.phase)) return BY_PHASE[c.phase]

  // With a weather word carrying the conditions, the hour keeps the mood — so
  // a wet morning and a wet evening are both rainy but not identical. Without
  // one, the weather has to take the mood or it would not be felt at all.
  const byPhase = BY_PHASE[c.phase]
  if (c.weather && WEATHER_TEXT[c.weather]) return DAMPENED[byPhase] ?? byPhase
  return (c.weather ? WEATHER_MOOD[c.weather] : undefined) ?? byPhase
}

export function audiusQuery(c: Conditions, genre: Genre): AudiusQuery {
  const mood = moodFor(c)
  const night = SLEEPS_AT_NIGHT.includes(genre.id) ? NIGHT_QUERY[c.phase] : undefined
  if (night) return { ...night, mood }

  const base = GENRE_MAP[genre.id] ?? GENRE_MAP.lofi
  const text = textFor(c)
  // Synthwave already searches by text and cannot take a second word — two
  // words collapse the pool.
  if (base.query || !text) {
    return { ...base, mood, label: `${mood} ${genre.label.toLowerCase()}` }
  }
  // "Easygoing rain lofi", "Cool night lofi" — mood, conditions, genre.
  return { ...base, mood, query: text, label: `${mood} ${text} ${genre.label.toLowerCase()}` }
}
