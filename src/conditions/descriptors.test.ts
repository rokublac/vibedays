import { describe, it, expect } from 'vitest'
import {
  cloudBand, precipBand, tempBand, describeTerms, signature, headline, conditionWords, PHASES,
} from './descriptors'
import type { Conditions } from '../types'

const C = (over: Partial<Conditions> = {}): Conditions => ({
  phase: 'sunset-golden', season: 'winter', weather: 'clear',
  cloud: 'clear', precip: 'none', temp: 'cold', ...over,
})

describe('cloudBand', () => {
  it.each([[0, 'clear'], [14, 'clear'], [15, 'hazy'], [39, 'hazy'],
           [40, 'scattered'], [69, 'scattered'], [70, 'overcast'], [100, 'overcast']])(
    '%i%% → %s', (pct, band) => expect(cloudBand(pct)).toBe(band))
  it('is null without data', () => expect(cloudBand(null)).toBeNull())
})

describe('precipBand', () => {
  it('distinguishes a sprinkle from a downpour', () => {
    expect(precipBand(0, 'rain')).toBe('none')
    expect(precipBand(0.1, 'rain')).toBe('sprinkle')
    expect(precipBand(0.5, 'rain')).toBe('drizzle')
    expect(precipBand(2, 'rain')).toBe('steady')
    expect(precipBand(9, 'rain')).toBe('downpour')
  })
  it('calls out snow regardless of amount', () => {
    expect(precipBand(0, 'snow')).toBe('snowing')
    expect(precipBand(5, 'snow')).toBe('snowing')
  })
  it('is null without data', () => expect(precipBand(null, 'clear')).toBeNull())
})

describe('tempBand', () => {
  it.each([[-5, 'freezing'], [2.9, 'freezing'], [3, 'cold'], [11, 'cold'],
           [12, 'mild'], [21, 'mild'], [22, 'warm'], [29, 'warm'], [30, 'hot'], [40, 'hot']])(
    '%s°C → %s', (c, band) => expect(tempBand(c)).toBe(band))
  it('is null without data', () => expect(tempBand(null)).toBeNull())
})

describe('describeTerms', () => {
  it('leads with the phase', () => {
    expect(describeTerms(C())[0]).toBe('sunset golden hour')
  })
  it('drops bands that add nothing to a search', () => {
    const terms = describeTerms(C({ precip: 'none', temp: 'mild', cloud: 'hazy' }))
    expect(terms).toEqual(['sunset golden hour', 'winter'])
  })
  it('includes precipitation, cloud and temperature when notable', () => {
    const terms = describeTerms(C({ precip: 'steady', cloud: 'overcast', temp: 'freezing' }))
    expect(terms).toEqual(['sunset golden hour', 'rainy', 'overcast grey', 'frosty', 'winter'])
  })
  it('produces terms for every phase', () => {
    for (const phase of PHASES) expect(describeTerms(C({ phase }))[0]).toBeTruthy()
  })
})

describe('signature', () => {
  it('separates combinations that should pin separately', () => {
    expect(signature(C({ temp: 'cold' }))).not.toBe(signature(C({ temp: 'warm' })))
    expect(signature(C({ phase: 'midday' }))).not.toBe(signature(C({ phase: 'deep-night' })))
    expect(signature(C({ cloud: 'clear' }))).not.toBe(signature(C({ cloud: 'overcast' })))
  })
  it('is stable for identical conditions', () => {
    expect(signature(C())).toBe(signature(C()))
  })
})

describe('headline and conditionWords', () => {
  it('names the phase for the hero', () => {
    expect(headline(C())).toBe('Golden hour')
    expect(headline(C({ phase: 'evening' }))).toBe('Evening')
    expect(headline(C({ phase: 'deep-night' }))).toBe('Deep night')
    expect(headline(C({ phase: 'late-night' }))).toBe('Late night')
  })

  it('gives the night phases distinct energy in their search terms', () => {
    const terms = (phase: 'evening' | 'deep-night' | 'late-night') =>
      describeTerms(C({ phase }))[0]
    expect(terms('evening')).toContain('unwind')
    expect(terms('deep-night')).toContain('mellow')
    expect(terms('late-night')).toContain('sleep')
    // Evening must not ask for sleep music: that was the complaint.
    expect(terms('evening')).not.toContain('sleep')
  })
  it('lists the bands, skipping "none" precipitation', () => {
    expect(conditionWords(C())).toEqual(['clear', 'cold', 'winter'])
    expect(conditionWords(C({ precip: 'drizzle' }))).toEqual(['clear', 'drizzle', 'cold', 'winter'])
  })
})
