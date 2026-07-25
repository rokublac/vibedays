import { describe, it, expect, vi } from 'vitest'
import { playPlaylist } from './playback-api'

describe('playPlaylist', () => {
  it('PUTs the playlist context_uri to the device', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true, status: 204 }) as unknown as typeof fetch
    await playPlaylist('TOKEN', 'DEV', 'PL', fetchFn)
    const [url, init] = (fetchFn as any).mock.calls[0]
    expect(url).toBe('https://api.spotify.com/v1/me/player/play?device_id=DEV')
    expect(init.method).toBe('PUT')
    expect(init.headers.Authorization).toBe('Bearer TOKEN')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(init.body)).toEqual({ context_uri: 'spotify:playlist:PL' })
  })
  it('throws on non-ok', async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: false, status: 404 }) as unknown as typeof fetch
    await expect(playPlaylist('T', 'D', 'P', fetchFn)).rejects.toThrow()
  })
})
