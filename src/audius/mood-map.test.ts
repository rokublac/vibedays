import { describe, it, expect } from 'vitest'
import { moodFor, audiusQuery } from './mood-map'
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

describe('moodFor', () => {
  it('maps every phase to a mood', () => {
    const phases: SunPhase[] = [
      'late-night', 'dawn', 'sunrise-golden', 'morning', 'midday',
      'afternoon', 'sunset-golden', 'blue-hour', 'evening', 'deep-night',
    ]
    for (const p of phases) expect(moodFor(at(p))).toBeTruthy()
  })

  it('reads the hour on a clear day', () => {
    expect(moodFor(at('midday'))).toBe('Upbeat')
    expect(moodFor(at('evening'))).toBe('Cool')
    expect(moodFor(at('sunset-golden'))).toBe('Romantic')
    expect(moodFor(at('blue-hour'))).toBe('Sophisticated')
    expect(moodFor(at('dawn'))).toBe('Tender')
    expect(moodFor(at('morning'))).toBe('Easygoing')
  })

  it('lets weather override the hour', () => {
    // Rain changes the feel of a day more than the clock does.
    expect(moodFor(at('midday', 'rain'))).toBe('Melancholy')
    expect(moodFor(at('midday', 'storm'))).toBe('Brooding')
    expect(moodFor(at('midday', 'fog'))).toBe('Brooding')
    expect(moodFor(at('midday', 'snow'))).toBe('Tender')
    expect(moodFor(at('midday', 'cloudy'))).toBe('Sentimental')
  })

  it('lets night beat weather', () => {
    // descriptors.ts already pins "sleep" at late night: sleep outranks the sky.
    expect(moodFor(at('late-night', 'storm'))).toBe('Peaceful')
    expect(moodFor(at('deep-night', 'rain'))).toBe('Peaceful')
  })

  it('falls back to the hour when the weather is unknown', () => {
    expect(moodFor(at('evening', null))).toBe('Cool')
  })

  it('leaves a clear sky to the hour', () => {
    expect(moodFor(at('midday', 'clear'))).toBe('Upbeat')
  })
})

describe('audiusQuery', () => {
  it('maps the four genres that exist on audius', () => {
    expect(audiusQuery(at('evening'), genreById('lofi')).genre).toBe('Lo-Fi')
    expect(audiusQuery(at('evening'), genreById('jazz')).genre).toBe('Jazz')
    expect(audiusQuery(at('evening'), genreById('classical')).genre).toBe('Classical')
    expect(audiusQuery(at('evening'), genreById('ambient')).genre).toBe('Ambient')
  })

  it('searches synthwave by text, with no genre filter', () => {
    // Synthwave is not an Audius genre; forcing genre=Electronic returned
    // generic electronic instead of retrowave.
    const q = audiusQuery(at('evening'), genreById('synthwave'))
    expect(q.query).toBe('synthwave')
    expect(q.genre).toBeUndefined()
  })

  it('carries the mood through', () => {
    expect(audiusQuery(at('midday', 'rain'), genreById('lofi')).mood).toBe('Melancholy')
  })

  it('labels the vibe for the "Playing from" line', () => {
    expect(audiusQuery(at('evening'), genreById('lofi')).label).toBe('Cool lofi')
    expect(audiusQuery(at('midday', 'rain'), genreById('jazz')).label).toBe('Melancholy jazz')
  })
})

describe('the small hours', () => {
  // Measured: Lo-Fi + Peaceful at 3am returns hip-hop instrumentals
  // ("Corvette Cassette Remix", "Droplet"), not sleep music. The genre filter
  // itself has to move, not just the mood.
  it('leaves lofi behind for sleep ambient before midnight', () => {
    const q = audiusQuery(at('late-night'), genreById('lofi'))
    expect(q.genre).toBe('Ambient')
    expect(q.query).toBe('sleep ambient')
    expect(q.mood).toBe('Peaceful')
  })

  it('goes deeper still in the small hours', () => {
    const q = audiusQuery(at('deep-night'), genreById('lofi'))
    expect(q.genre).toBe('Ambient')
    expect(q.query).toBe('zen meditation')
  })

  it('applies to ambient too, which should also get sleepier', () => {
    expect(audiusQuery(at('deep-night'), genreById('ambient')).query).toBe('zen meditation')
  })

  it('says what it is actually playing, not the genre you picked', () => {
    // "Peaceful lofi" over a zen meditation track would be a lie.
    expect(audiusQuery(at('deep-night'), genreById('lofi')).label).toBe('Zen meditation')
    expect(audiusQuery(at('late-night'), genreById('lofi')).label).toBe('Sleep ambient')
  })

  it('leaves jazz and classical alone — late-night jazz is a real thing', () => {
    expect(audiusQuery(at('deep-night'), genreById('jazz')).genre).toBe('Jazz')
    expect(audiusQuery(at('deep-night'), genreById('classical')).genre).toBe('Classical')
    expect(audiusQuery(at('late-night'), genreById('synthwave')).query).toBe('synthwave')
  })

  it('ignores the weather at night, like the mood does', () => {
    // Sleep outranks the sky; a storm at 3am is still sleep music.
    expect(audiusQuery(at('deep-night', 'storm'), genreById('lofi')).query).toBe('zen meditation')
  })
})
