import { describe, it, expect } from 'vitest'
import { buildQueryLadder, ANCHOR } from './query'

describe('buildQueryLadder', () => {
  it('goes from most specific to broadest', () => {
    expect(buildQueryLadder(['sunset golden hour', 'rainy', 'cold', 'winter'])).toEqual([
      'lofi sunset golden hour rainy cold winter',
      'lofi sunset golden hour rainy cold',
      'lofi sunset golden hour rainy',
      'lofi sunset golden hour',
      'lofi',
    ])
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
})
