import { describe, it, expect, vi } from 'vitest'
import { fetchProfile, pickAvatar, initialsOf } from './profile-api'

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response

describe('pickAvatar', () => {
  it('picks the smallest image at least 96px, for a sharp 2x avatar', () => {
    expect(pickAvatar([
      { url: 'x64.jpg', width: 64 },
      { url: 'x300.jpg', width: 300 },
      { url: 'x640.jpg', width: 640 },
    ])).toBe('x300.jpg')
  })
  it('falls back to the largest when all are small', () => {
    expect(pickAvatar([{ url: 'a.jpg', width: 32 }, { url: 'b.jpg', width: 64 }])).toBe('b.jpg')
  })
  it('uses the first when widths are missing', () => {
    expect(pickAvatar([{ url: 'only.jpg' }])).toBe('only.jpg')
  })
  it('is null for no usable images', () => {
    expect(pickAvatar(undefined)).toBeNull()
    expect(pickAvatar([])).toBeNull()
    expect(pickAvatar([null, { width: 300 }])).toBeNull()
  })
})

describe('initialsOf', () => {
  it('takes first and last initials', () => expect(initialsOf('Brad Beal')).toBe('BB'))
  it('takes two letters from a single name', () => expect(initialsOf('roku')).toBe('RO'))
  it('handles extra whitespace', () => expect(initialsOf('  ada   lovelace  ')).toBe('AL'))
  it('never returns empty', () => expect(initialsOf('   ')).toBe('?'))
})

describe('fetchProfile', () => {
  it('reads the display name, avatar and product', async () => {
    const fetchFn = vi.fn(async () => ok({
      id: 'rokublac',
      display_name: 'Roku',
      images: [{ url: 'a.jpg', width: 300 }],
      product: 'premium',
    }))
    expect(await fetchProfile('T', fetchFn as never)).toEqual({
      id: 'rokublac', displayName: 'Roku', avatarUrl: 'a.jpg', product: 'premium',
    })
  })

  it('falls back to the id when the account has no display name', async () => {
    const fetchFn = vi.fn(async () => ok({ id: 'rokublac', display_name: null, images: [] }))
    const p = await fetchProfile('T', fetchFn as never)
    expect(p.displayName).toBe('rokublac')
    expect(p.avatarUrl).toBeNull()
  })

  it('sends the bearer token to /v1/me', async () => {
    const fetchFn = vi.fn(async (_u: string, _i?: RequestInit) => ok({ id: 'x' }))
    await fetchProfile('TOKEN', fetchFn as never)
    expect(fetchFn.mock.calls[0][0]).toContain('/v1/me')
    expect((fetchFn.mock.calls[0][1]!.headers as Record<string, string>).Authorization)
      .toBe('Bearer TOKEN')
  })

  it("includes Spotify's explanation when the request fails", async () => {
    const fetchFn = vi.fn(async () =>
      ({ ok: false, status: 401, text: async () => 'token expired' }) as Response)
    await expect(fetchProfile('T', fetchFn as never)).rejects.toThrow('token expired')
  })
})
