import { describe, it, expect, vi } from 'vitest'
import { searchPlaylists, usablePlaylists, MAX_SEARCH_LIMIT } from './search-api'

const pl = (id: string, name: string, owner = 'someuser') => ({ id, name, owner: { id: owner } })

const okResponse = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as Response

describe('usablePlaylists', () => {
  it('keeps well-formed community playlists', () => {
    expect(usablePlaylists([pl('a', 'Lofi Beats'), pl('b', 'Rainy Day')])).toEqual([
      { id: 'a', name: 'Lofi Beats', owner: 'someuser' },
      { id: 'b', name: 'Rainy Day', owner: 'someuser' },
    ])
  })

  it('drops Spotify-owned playlists, which 404 for apps made after Nov 2024', () => {
    const out = usablePlaylists([pl('a', 'Lofi Beats', 'spotify'), pl('b', 'Mine')])
    expect(out.map((p) => p.id)).toEqual(['b'])
  })

  it('matches the blocked owner case-insensitively', () => {
    expect(usablePlaylists([pl('a', 'X', 'Spotify')])).toEqual([])
  })

  it('drops the null holes search returns', () => {
    expect(usablePlaylists([null, pl('a', 'Mine'), undefined]).map((p) => p.id)).toEqual(['a'])
  })

  it('drops entries missing the fields they claim to have', () => {
    const out = usablePlaylists([
      { id: 'a', name: 'no owner' },
      { id: '', name: 'blank id', owner: { id: 'u' } },
      { id: 'b', name: '', owner: { id: 'u' } },
      { name: 'no id', owner: { id: 'u' } },
      { id: 'c', name: 'fine', owner: { id: 'u' } },
    ])
    expect(out.map((p) => p.id)).toEqual(['c'])
  })

  it('is empty for a non-array', () => {
    expect(usablePlaylists(undefined)).toEqual([])
    expect(usablePlaylists(null)).toEqual([])
    expect(usablePlaylists({})).toEqual([])
  })
})

describe('searchPlaylists', () => {
  it('queries the public catalogue, not the user library', async () => {
    const fetchFn = vi.fn(async (_u: string, _i?: RequestInit) =>
      okResponse({ playlists: { items: [pl('a', 'Mine')] } }))
    await searchPlaylists('TOKEN', 'lofi rainy day cozy', fetchFn as never)

    const url = fetchFn.mock.calls[0][0]
    expect(url).toContain('/v1/search')
    expect(url).not.toContain('/me/')
    expect(url).toContain('type=playlist')
    expect(url).toContain(encodeURIComponent('lofi rainy day cozy'))
  })

  it('sends the bearer token', async () => {
    const fetchFn = vi.fn(async (_u: string, _i?: RequestInit) =>
      okResponse({ playlists: { items: [] } }))
    await searchPlaylists('TOKEN', 'lofi', fetchFn as never)
    const init = fetchFn.mock.calls[0][1]!
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer TOKEN')
  })

  it('returns only the usable results', async () => {
    const fetchFn = vi.fn(async () =>
      okResponse({ playlists: { items: [null, pl('a', 'Editorial', 'spotify'), pl('b', 'Mine')] } }),
    )
    const out = await searchPlaylists('TOKEN', 'lofi', fetchFn as never)
    expect(out).toEqual([{ id: 'b', name: 'Mine', owner: 'someuser' }])
  })

  it('survives a response with no playlists object', async () => {
    const fetchFn = vi.fn(async () => okResponse({}))
    await expect(searchPlaylists('TOKEN', 'lofi', fetchFn as never)).resolves.toEqual([])
  })

  it('never asks for more than the endpoint allows, which 400s rather than clamping', async () => {
    const fetchFn = vi.fn(async (_u: string, _i?: RequestInit) =>
      okResponse({ playlists: { items: [] } }))
    await searchPlaylists('TOKEN', 'lofi', fetchFn as never, 50)
    expect(fetchFn.mock.calls[0][0]).toContain(`limit=${MAX_SEARCH_LIMIT}`)
    expect(MAX_SEARCH_LIMIT).toBeLessThanOrEqual(10)
  })

  it('defaults to a limit the endpoint accepts', async () => {
    const fetchFn = vi.fn(async (_u: string, _i?: RequestInit) =>
      okResponse({ playlists: { items: [] } }))
    await searchPlaylists('TOKEN', 'lofi', fetchFn as never)
    expect(fetchFn.mock.calls[0][0]).toContain(`limit=${MAX_SEARCH_LIMIT}`)
  })

  it('throws on a failed request', async () => {
    const fetchFn = vi.fn(async () =>
      ({ ok: false, status: 401, text: async () => '' }) as Response)
    await expect(searchPlaylists('TOKEN', 'lofi', fetchFn as never)).rejects.toThrow('401')
  })

  it("includes Spotify's own explanation in the error", async () => {
    const body = '{"error":{"status":400,"message":"Invalid limit"}}'
    const fetchFn = vi.fn(async () =>
      ({ ok: false, status: 400, text: async () => body }) as Response)
    await expect(searchPlaylists('TOKEN', 'lofi', fetchFn as never))
      .rejects.toThrow('Invalid limit')
  })
})
