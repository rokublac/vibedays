import { describe, it, expect } from 'vitest'
import { buildQueryLadder, dedupeWords, ANCHOR } from './query'

describe('dedupeWords', () => {
  it('drops repeats, keeping the first occurrence', () => {
    expect(dedupeWords('ambient meditation spa sleep ambient dreamy'))
      .toBe('ambient meditation spa sleep dreamy')
  })
  it('ignores case when comparing', () => {
    expect(dedupeWords('Jazz jazz JAZZ evening')).toBe('Jazz evening')
  })
  it('collapses stray whitespace', () => {
    expect(dedupeWords('  lofi   evening  ')).toBe('lofi evening')
  })
  it('leaves a query with no repeats alone', () => {
    expect(dedupeWords('lofi evening chill unwind')).toBe('lofi evening chill unwind')
  })
})

describe('buildQueryLadder', () => {
  it('goes from most specific to broadest', () => {
    expect(buildQueryLadder(['sunset golden hour', 'rainy', 'cold', 'winter'])).toEqual([
      'lofi sunset golden hour rainy cold winter',
      'lofi sunset golden hour rainy cold',
      'lofi sunset golden hour rainy',
      'lofi sunset golden hour',
      // The phase then shortens word by word rather than vanishing in one step.
      'lofi sunset golden',
      'lofi sunset',
      'lofi',
    ])
  })

  it('leaves no cliff between the last mood rung and the bare anchor', () => {
    // Genres whose playlists are not named after moods failed every mood rung
    // at once and landed on generic results.
    const ladder = buildQueryLadder(['evening chill unwind', 'cold'], 'deep house')
    expect(ladder).toContain('deep house evening')
    expect(ladder.indexOf('deep house evening')).toBeLessThan(ladder.indexOf('deep house'))
  })

  it('emits no duplicate rungs when the phase is a single word', () => {
    const ladder = buildQueryLadder(['jazz'], 'jazz')
    expect(new Set(ladder).size).toBe(ladder.length)
  })

  it('anchors every rung on the genre', () => {
    for (const q of buildQueryLadder(['a', 'b', 'c'])) expect(q.startsWith(ANCHOR)).toBe(true)
  })

  it('always ends with the bare anchor, so there is a last resort', () => {
    expect(buildQueryLadder(['a']).at(-1)).toBe(ANCHOR)
    expect(buildQueryLadder([]).at(-1)).toBe(ANCHOR)
  })

  it('drops empty terms rather than emitting double spaces', () => {
    expect(buildQueryLadder(['a', '', '  ', 'b'])).toEqual(['lofi a b', 'lofi a', 'lofi'])
  })

  it('is just the anchor for no terms', () => {
    expect(buildQueryLadder([])).toEqual([ANCHOR])
  })

  describe('pinned terms', () => {
    it('keeps a pinned word on every rung above the last-resort anchor', () => {
      const ladder = buildQueryLadder(['late night sleep mellow', 'cold'], 'lofi', ['sleep'])
      for (const rung of ladder.slice(0, -1)) expect(rung).toMatch(/(^|\s)sleep(\s|$)/)
    })

    it('does not repeat a pinned word the phase already carries', () => {
      const ladder = buildQueryLadder(['deep sleep ambient dreamy'], 'lofi', ['sleep'])
      expect(ladder).toEqual([
        'lofi deep sleep ambient dreamy',
        'lofi deep sleep ambient',
        'lofi deep sleep',
        // "lofi deep" + pinned "sleep" collapses into the rung above it.
        'lofi sleep',
        'lofi',
      ])
      expect(new Set(ladder).size).toBe(ladder.length)
    })

    it('rescues the rungs that used to drop sleep entirely', () => {
      const ladder = buildQueryLadder(['late night sleep mellow'], 'lofi', ['sleep'])
      expect(ladder).toContain('lofi late sleep')
      expect(ladder).not.toContain('lofi late')
      expect(ladder).not.toContain('lofi late night')
    })

    // Pinning removed the plain-anchor rung, and with it the guarantee that
    // some rung always matches. It belongs below the pinned one, not instead.
    it('still keeps a bare anchor underneath, as a true last resort', () => {
      const ladder = buildQueryLadder(['late night sleep mellow'], 'lofi', ['sleep'])
      expect(ladder.at(-2)).toBe('lofi sleep')
      expect(ladder.at(-1)).toBe('lofi')
    })

    it('adds no second anchor rung when nothing is pinned', () => {
      const ladder = buildQueryLadder(['evening chill'], 'lofi')
      expect(ladder.filter((r) => r === 'lofi')).toHaveLength(1)
    })

    it('is unchanged when nothing is pinned', () => {
      expect(buildQueryLadder(['evening chill'], 'lofi', []))
        .toEqual(buildQueryLadder(['evening chill'], 'lofi'))
    })
  })

  it('uses the genre anchor when one is given', () => {
    expect(buildQueryLadder(['evening chill'], 'synthwave retrowave')).toEqual([
      'synthwave retrowave evening chill',
      'synthwave retrowave evening',
      'synthwave retrowave',
    ])
  })

  it('falls back to lofi for a blank anchor', () => {
    expect(buildQueryLadder(['a'], '')).toEqual(['lofi a', 'lofi'])
    expect(buildQueryLadder(['a'], '   ')).toEqual(['lofi a', 'lofi'])
  })

  it('does not repeat a word the anchor and the terms share', () => {
    // Ambient on a late night: the anchor and the phase term both say "ambient".
    expect(buildQueryLadder(['sleep ambient dreamy'], 'ambient meditation spa')[0])
      .toBe('ambient meditation spa sleep dreamy')
  })
})
