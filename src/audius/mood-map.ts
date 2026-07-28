import type { Conditions, SunPhase, WeatherKind } from '../types'
import type { Genre } from '../config/genres'

export interface AudiusQuery {
  genre?: string
  mood?: string
  query?: string
  /** What the "Playing from" line says. */
  label?: string
}

/** Every genre the picker offers maps onto a real Audius genre. */
const GENRE_MAP: Record<string, AudiusQuery> = {
  lofi: { genre: 'Lo-Fi' },
  jazz: { genre: 'Jazz' },
  classical: { genre: 'Classical' },
  ambient: { genre: 'Ambient' },
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
 * What each hour sounds like, as concrete imagery rather than the name of the
 * hour. Measured: artists title tracks "glow", "neon", "nostalgic" — never
 * "hopeful" (3 tracks), "emotive" (2) or "wistful" (1). Feeling words do not
 * exist in the catalogue; things you can see and touch do.
 *
 * Some entries set a mood as well and some deliberately do not. Mood and text
 * together intersect to almost nothing unless the mood is a common one:
 * "glow" alone is 40 tracks, Yearning + "glow" is zero; "nostalgic" is 39,
 * Romantic + "nostalgic" is one. Where the pairing survives it is kept,
 * because it is more precise; where it collapses, the word carries the vibe
 * alone. Pool sizes measured against the live catalogue are in the comments.
 */
const PHASE_VIBE: Partial<Record<SunPhase, AudiusQuery>> = {
  dawn: { query: 'soft', label: 'Soft dawn' }, // 40
  'sunrise-golden': { query: 'glow', label: 'Golden glow' }, // 40
  morning: { query: 'morning', mood: 'Easygoing', label: 'Easy morning' }, // 34
  midday: { query: 'sunny', label: 'Sunny midday' }, // 18
  afternoon: { query: 'chill', mood: 'Easygoing', label: 'Afternoon chill' }, // 40
  'sunset-golden': { query: 'nostalgic', label: 'Golden hour' }, // 39
  'blue-hour': { query: 'neon', label: 'Neon blue hour' }, // 36
  evening: { query: 'night', mood: 'Cool', label: 'Cool night' }, // 25
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
/** The hour's vibe, before weather has its say. */
export function vibeFor(c: Conditions): AudiusQuery {
  return PHASE_VIBE[c.phase] ?? { mood: BY_PHASE[c.phase], label: BY_PHASE[c.phase] }
}

/**
 * The mood filter alone, kept for the paths that still want one: the small
 * hours, and weather that has no word of its own.
 */
export function moodFor(c: Conditions): string {
  if (NIGHT.includes(c.phase)) return BY_PHASE[c.phase]
  const byPhase = vibeFor(c).mood ?? BY_PHASE[c.phase]
  if (c.weather && WEATHER_TEXT[c.weather]) return DAMPENED[byPhase] ?? byPhase
  return (c.weather ? WEATHER_MOOD[c.weather] : undefined) ?? byPhase
}

export function audiusQuery(c: Conditions, genre: Genre): AudiusQuery {
  const night = SLEEPS_AT_NIGHT.includes(genre.id) ? NIGHT_QUERY[c.phase] : undefined
  if (night) return { ...night, mood: BY_PHASE[c.phase] }

  const base = GENRE_MAP[genre.id] ?? GENRE_MAP.lofi
  const vibe = vibeFor(c)
  const weatherWord = c.weather ? WEATHER_TEXT[c.weather] : undefined

  if (weatherWord) {
    // Rain takes the one text slot, and the hour keeps its mood so a wet
    // morning and a wet evening are both rainy without being identical.
    const mood = moodFor(c)
    return {
      ...base,
      mood,
      query: weatherWord,
      label: `Rainy ${(vibe.label ?? mood).toLowerCase()}`,
    }
  }

  // Weather with no word of its own can only be felt through the mood, which
  // means giving up the hour's imagery for it.
  const weatherMood = c.weather ? WEATHER_MOOD[c.weather] : undefined
  if (weatherMood) {
    return { ...base, mood: weatherMood, label: `${weatherMood} ${genre.label.toLowerCase()}` }
  }

  return { ...base, ...vibe }
}
