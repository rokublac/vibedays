import { describe, it, expect } from 'vitest'
import { moodFor, vibeFor, audiusQuery } from './mood-map'
import type { Conditions, SunPhase, WeatherKind } from '../types'
import { genreById } from '../config/genres'

const at = (phase: SunPhase, weather: WeatherKind | null = 'clear'): Conditions => ({
  located: true,
  phase,
  season: 'summer',
  weather,
  cloud: null,
  precip: null,
  temp: 'mild',
})

const ALL_PHASES: SunPhase[] = [
  'late-night', 'dawn', 'sunrise-golden', 'morning', 'midday',
  'afternoon', 'sunset-golden', 'blue-hour', 'evening', 'deep-night',
]

const lofi = (phase: SunPhase, weather: WeatherKind | null = 'clear') =>
  audiusQuery(at(phase, weather), genreById('lofi'))

describe('vibeFor', () => {
  it('gives every daylight hour its own imagery', () => {
    // Concrete things, not emotions: "hopeful" returns 3 tracks, "glow" 40.
    expect(vibeFor(at('dawn')).query).toBe('soft')
    expect(vibeFor(at('sunrise-golden')).query).toBe('glow')
    expect(vibeFor(at('morning')).query).toBe('morning')
    expect(vibeFor(at('midday')).query).toBe('sunny')
    expect(vibeFor(at('afternoon')).query).toBe('chill')
    expect(vibeFor(at('sunset-golden')).query).toBe('nostalgic')
    expect(vibeFor(at('blue-hour')).query).toBe('neon')
    expect(vibeFor(at('evening')).query).toBe('night')
  })

  it('only pairs a mood with the word where the pool survives it', () => {
    // Easygoing and Cool are common enough to intersect; Yearning + "glow"
    // and Romantic + "nostalgic" are empty, so those go without a mood.
    expect(vibeFor(at('morning')).mood).toBe('Easygoing')
    expect(vibeFor(at('evening')).mood).toBe('Cool')
    expect(vibeFor(at('sunrise-golden')).mood).toBeUndefined()
    expect(vibeFor(at('sunset-golden')).mood).toBeUndefined()
    expect(vibeFor(at('blue-hour')).mood).toBeUndefined()
  })
})

describe('audiusQuery through the day', () => {
  it('never leaves a phase without something to search for', () => {
    for (const p of ALL_PHASES) {
      const q = lofi(p)
      expect(q.query ?? q.mood).toBeTruthy()
      expect(q.label).toBeTruthy()
    }
  })

  it('describes the hour in the label rather than naming a mood', () => {
    expect(lofi('sunset-golden').label).toBe('Golden hour')
    expect(lofi('blue-hour').label).toBe('Neon blue hour')
    expect(lofi('dawn').label).toBe('Soft dawn')
    expect(lofi('midday').label).toBe('Sunny midday')
  })
})

describe('weather', () => {
  it('spends the text slot on rain, keeping the hour in the mood', () => {
    // A wet morning and a wet evening should both be rainy, not identical.
    expect(lofi('morning', 'rain').query).toBe('rain')
    expect(lofi('morning', 'rain').mood).toBe('Easygoing')
    expect(lofi('evening', 'rain').mood).toBe('Cool')
    expect(lofi('morning', 'rain').label).toBe('Rainy easy morning')
  })

  it('softens moods that do not survive being paired with rain', () => {
    // Upbeat + rain is two tracks, and rain is not upbeat anyway.
    expect(moodFor(at('midday', 'rain'))).toBe('Sentimental')
  })

  it('falls back to a mood for weather with no word of its own', () => {
    // "storm" and "fog" return nothing as search text, so the mood is the
    // only way they can be felt — at the cost of the hour's imagery.
    expect(lofi('midday', 'storm').mood).toBe('Brooding')
    expect(lofi('midday', 'storm').query).toBeUndefined()
    expect(lofi('midday', 'fog').mood).toBe('Brooding')
    expect(lofi('midday', 'snow').mood).toBe('Tender')
    expect(lofi('midday', 'cloudy').mood).toBe('Sentimental')
  })

  it('leaves a clear sky to the hour', () => {
    expect(lofi('midday', 'clear').query).toBe('sunny')
  })
})

describe('the small hours', () => {
  it('leaves lofi behind for sleep ambient before midnight', () => {
    const q = lofi('late-night')
    expect(q.genre).toBe('Ambient')
    expect(q.query).toBe('sleep ambient')
    expect(q.mood).toBe('Peaceful')
  })

  it('goes deeper still in the small hours', () => {
    // Not "zen" — measured, that pulls toward spa and yoga.
    const q = lofi('deep-night')
    expect(q.genre).toBe('Ambient')
    expect(q.query).toBe('sleep music')
    expect(q.label).toBe('Sleep music')
  })

  it('applies to ambient too, which should also get sleepier', () => {
    expect(audiusQuery(at('deep-night'), genreById('ambient')).query).toBe('sleep music')
  })

  it('ignores the weather at night', () => {
    // Sleep outranks the sky; a storm at 3am is still sleep music.
    expect(lofi('deep-night', 'storm').query).toBe('sleep music')
    expect(lofi('late-night', 'rain').query).toBe('sleep ambient')
  })

  it('leaves jazz and classical alone — late-night jazz is a real thing', () => {
    expect(audiusQuery(at('deep-night'), genreById('jazz')).genre).toBe('Jazz')
    expect(audiusQuery(at('deep-night'), genreById('classical')).genre).toBe('Classical')
  })
})

describe('genres', () => {
  it('maps the four that exist on audius', () => {
    expect(lofi('evening').genre).toBe('Lo-Fi')
    expect(audiusQuery(at('evening'), genreById('jazz')).genre).toBe('Jazz')
    expect(audiusQuery(at('evening'), genreById('classical')).genre).toBe('Classical')
    expect(audiusQuery(at('evening'), genreById('ambient')).genre).toBe('Ambient')
  })

  it('gives synthwave a mood but no second word', () => {
    // It already spends the one text slot on its own name; a second word
    // collapses the pool.
    const q = audiusQuery(at('evening'), genreById('synthwave'))
    expect(q.query).toBe('synthwave')
    expect(q.genre).toBeUndefined()
    expect(q.mood).toBeTruthy()
  })
})
