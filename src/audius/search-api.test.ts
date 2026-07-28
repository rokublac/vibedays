import { describe, it, expect, vi } from 'vitest'
import { isPlayable, toTrack, streamUrl, searchTracks, HOST } from './search-api'

const raw = (over: Record<string, unknown> = {}) => ({
  id: 'a5K2a',
  title: 'Corvette Cassette Remix',
  duration: 210,
  permalink: '/secretPANDA007/corvette-cassette-remix',
  user: { name: 'tucker', handle: 'secretPANDA007' },
  artwork: {
    '150x150': 'https://cdn/150.jpg',
    '480x480': 'https://cdn/480.jpg',
    '1000x1000': 'https://cdn/1000.jpg',
  },
  is_streamable: true,
  is_delete: false,
  is_available: true,
  is_stream_gated: false,
  ...over,
})

describe('isPlayable', () => {
  it('accepts a normal track', () => {
    expect(isPlayable(raw())).toBe(true)
  })

  it('rejects each unplayable gate on its own', () => {
    expect(isPlayable(raw({ is_streamable: false }))).toBe(false)
    expect(isPlayable(raw({ is_delete: true }))).toBe(false)
    expect(isPlayable(raw({ is_available: false }))).toBe(false)
    // Gated tracks need a wallet signature we do not have.
    expect(isPlayable(raw({ is_stream_gated: true }))).toBe(false)
  })

  it('rejects durations outside the playable band', () => {
    // Measured: the tail runs to 3.7-hour DJ mixes, and p5 is 79s of loops.
    expect(isPlayable(raw({ duration: 59 }))).toBe(false)
    expect(isPlayable(raw({ duration: 60 }))).toBe(true)
    expect(isPlayable(raw({ duration: 900 }))).toBe(true)
    expect(isPlayable(raw({ duration: 901 }))).toBe(false)
    expect(isPlayable(raw({ duration: 13235 }))).toBe(false)
  })

  it('rejects junk', () => {
    expect(isPlayable(null)).toBe(false)
    expect(isPlayable({})).toBe(false)
  })
})

describe('toTrack', () => {
  it('maps the fields the app uses', () => {
    expect(toTrack(raw())).toEqual({
      id: 'a5K2a',
      title: 'Corvette Cassette Remix',
      duration: 210,
      permalink: '/secretPANDA007/corvette-cassette-remix',
      artworkUrl: 'https://cdn/480.jpg',
      artist: 'tucker',
    })
  })

  it('falls back through the artwork sizes', () => {
    // The card renders at 80px, so 480 stays sharp at 2x.
    expect(toTrack(raw({ artwork: { '150x150': 'https://cdn/150.jpg' } }))!.artworkUrl)
      .toBe('https://cdn/150.jpg')
    expect(toTrack(raw({ artwork: null }))!.artworkUrl).toBeNull()
  })

  it('returns null for an unplayable track, so mapping and filtering are one pass', () => {
    expect(toTrack(raw({ is_delete: true }))).toBeNull()
  })

  it('tolerates a missing artist', () => {
    expect(toTrack(raw({ user: null }))!.artist).toBe('')
  })
})

describe('streamUrl', () => {
  it('points at the stream endpoint with the app name', () => {
    expect(streamUrl('a5K2a')).toBe(`${HOST}/v1/tracks/a5K2a/stream?app_name=vibedays`)
  })
})

describe('searchTracks', () => {
  function fakeFetch(data: unknown[], ok = true) {
    return vi.fn(async () => ({ ok, json: async () => ({ data }) }) as unknown as Response)
  }

  it('builds a filtered search url', async () => {
    const f = fakeFetch([])
    await searchTracks({ genre: 'Lo-Fi', mood: 'Peaceful', offset: 100 }, f as never)
    const url = String((f.mock.calls[0] as unknown[])[0])
    expect(url).toContain('genre=Lo-Fi')
    expect(url).toContain('mood=Peaceful')
    expect(url).toContain('offset=100')
    expect(url).toContain('app_name=vibedays')
    expect(url).toContain('limit=100')
  })

  it('omits filters that were not asked for', async () => {
    const f = fakeFetch([])
    // Synthwave is not an Audius genre, so it searches by text with no genre.
    await searchTracks({ query: 'synthwave' }, f as never)
    const url = String((f.mock.calls[0] as unknown[])[0])
    expect(url).toContain('query=synthwave')
    expect(url).not.toContain('genre=')
    expect(url).not.toContain('mood=')
  })

  it('drops unplayable tracks from the results', async () => {
    const f = fakeFetch([raw(), raw({ id: 'bad', duration: 5000 }), raw({ id: 'ok2' })])
    const out = await searchTracks({ genre: 'Lo-Fi' }, f as never)
    expect(out.map((t) => t.id)).toEqual(['a5K2a', 'ok2'])
  })

  it('throws on a non-ok response, so the caller decides', async () => {
    await expect(searchTracks({ genre: 'Lo-Fi' }, fakeFetch([], false) as never)).rejects.toThrow()
  })
})
