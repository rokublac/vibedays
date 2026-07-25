import { describe, it, expect } from 'vitest'
import { contradictions, nameContradicts, rankPlaylists } from './rank'
import type { Conditions } from '../types'
import type { SpotifyPlaylist } from '../spotify/search-api'

const C = (over: Partial<Conditions> = {}): Conditions => ({
  located: true, phase: 'deep-night', season: 'winter', weather: 'clear',
  cloud: 'clear', precip: 'none', temp: 'cold', ...over,
})
const pl = (name: string): SpotifyPlaylist => ({ id: name, name, owner: 'u' })

describe('contradictions', () => {
  it('rules out rain when it is not raining', () => {
    expect(contradictions(C({ precip: 'none' }))).toContain('rain')
  })
  it('allows rain when it is raining', () => {
    expect(contradictions(C({ precip: 'steady' }))).not.toContain('rain')
  })
  it('rules out snow unless it is snowing', () => {
    expect(contradictions(C({ precip: 'none' }))).toContain('snow')
    expect(contradictions(C({ precip: 'snowing' }))).not.toContain('snow')
  })
  it('rules out the other three seasons', () => {
    const words = contradictions(C({ season: 'winter' }))
    expect(words).toEqual(expect.arrayContaining(['summer', 'spring', 'autumn']))
    expect(words).not.toContain('winter')
  })
  it('rules out daytime words at night and vice versa', () => {
    expect(contradictions(C({ phase: 'deep-night' }))).toContain('morning')
    expect(contradictions(C({ phase: 'midday' }))).toContain('midnight')
    expect(contradictions(C({ phase: 'midday' }))).not.toContain('morning')
  })
})

describe('nameContradicts', () => {
  it('matches whole words only', () => {
    expect(nameContradicts('lofi sleep, lofi rain', ['rain'])).toBe(true)
    expect(nameContradicts('rainbow road lofi', ['rain'])).toBe(false)
    expect(nameContradicts('training beats', ['rain'])).toBe(false)
  })
  it('is case insensitive', () => {
    expect(nameContradicts('LOFI RAIN', ['rain'])).toBe(true)
  })
  it('matches across punctuation', () => {
    expect(nameContradicts('lofi sleep, lofi rain 💤', ['rain'])).toBe(true)
    expect(nameContradicts('lofi/rain', ['rain'])).toBe(true)
  })
  it('is false with no words to check', () => {
    expect(nameContradicts('anything', [])).toBe(false)
  })
})

describe('rankPlaylists', () => {
  it('separates the playlist that caused this, on a clear night', () => {
    const { clean, contradicting } = rankPlaylists(
      [pl('lofi sleep, lofi rain 💤'), pl('deep night lofi'), pl('winter night beats')],
      C(),
    )
    expect(contradicting.map((p) => p.name)).toEqual(['lofi sleep, lofi rain 💤'])
    expect(clean.map((p) => p.name)).toEqual(['deep night lofi', 'winter night beats'])
  })

  it('keeps rain playlists when it is actually raining', () => {
    const { clean } = rankPlaylists([pl('lofi rain')], C({ precip: 'steady' }))
    expect(clean).toHaveLength(1)
  })

  it('rejects a summer playlist in winter', () => {
    const { contradicting } = rankPlaylists([pl('summer lofi vibes')], C({ season: 'winter' }))
    expect(contradicting).toHaveLength(1)
  })

  it('returns everything as contradicting rather than losing it', () => {
    const all = [pl('lofi rain'), pl('summer lofi')]
    const { clean, contradicting } = rankPlaylists(all, C())
    expect(clean).toHaveLength(0)
    expect(contradicting).toHaveLength(2)
  })

  describe('sleep preference on the night phases', () => {
    // The caller picks from the top of `clean`, so ordering is the whole point.
    const mixed = () => [
      pl('winter night beats'), pl('Deep Sleep'), pl('deep night lofi'), pl('Sleepy Lofi'),
    ]

    it('floats sleep playlists to the top at deep night', () => {
      const { clean } = rankPlaylists(mixed(), C({ phase: 'deep-night' }))
      expect(clean.map((p) => p.name))
        .toEqual(['Deep Sleep', 'Sleepy Lofi', 'winter night beats', 'deep night lofi'])
    })

    it('does the same at late night', () => {
      const { clean } = rankPlaylists(mixed(), C({ phase: 'late-night' }))
      expect(clean.slice(0, 2).map((p) => p.name)).toEqual(['Deep Sleep', 'Sleepy Lofi'])
    })

    it('matches sleep, sleepy, sleeping and asleep', () => {
      const list = [pl('lofi beats'), pl('Sleeping In'), pl('Fall Asleep'), pl('Sleepy')]
      const { clean } = rankPlaylists(list, C({ phase: 'deep-night' }))
      expect(clean.at(-1)!.name).toBe('lofi beats')
    })

    it('holds the original order among the non-sleep playlists', () => {
      const { clean } = rankPlaylists(mixed(), C({ phase: 'deep-night' }))
      expect(clean.slice(2).map((p) => p.name)).toEqual(['winter night beats', 'deep night lofi'])
    })

    it('leaves evening alone — only the two night phases prefer sleep', () => {
      const { clean } = rankPlaylists(mixed(), C({ phase: 'evening' }))
      expect(clean.map((p) => p.name)).toEqual(mixed().map((p) => p.name))
    })

    // Guards the existing rule: sleep is a contradiction in daylight, and
    // preferring it at night must not quietly reverse that.
    it('still rejects a sleep playlist at midday', () => {
      const { clean, contradicting } = rankPlaylists([pl('Deep Sleep')], C({ phase: 'midday' }))
      expect(clean).toHaveLength(0)
      expect(contradicting).toHaveLength(1)
    })
  })
})
