import { describe, it, expect, beforeEach } from 'vitest'

/**
 * main.ts runs this at boot; it is duplicated here rather than exported
 * because main has no other public surface and importing it would boot the app.
 */
function clearLegacyStorage(): void {
  for (const key of ['lwp_tokens_v2', 'lwp_pkce_verifier', 'hb_source']) {
    try { localStorage.removeItem(key) } catch { /* private mode */ }
  }
}

describe('legacy storage', () => {
  beforeEach(() => localStorage.clear())

  it('drops the dead Spotify token rather than leaving it in storage', () => {
    localStorage.setItem('lwp_tokens_v2', '{"access_token":"secret"}')
    localStorage.setItem('lwp_pkce_verifier', 'verifier')
    clearLegacyStorage()
    expect(localStorage.getItem('lwp_tokens_v2')).toBeNull()
    expect(localStorage.getItem('lwp_pkce_verifier')).toBeNull()
  })

  it('drops the stale source preference, which nothing reads now', () => {
    localStorage.setItem('hb_source', 'spotify')
    clearLegacyStorage()
    expect(localStorage.getItem('hb_source')).toBeNull()
  })

  it('leaves the settings people still use alone', () => {
    localStorage.setItem('hb_genre', 'jazz')
    localStorage.setItem('hb_volume', '{"level":0.4,"muted":false}')
    localStorage.setItem('hb_place', '{"name":"Sydney"}')
    clearLegacyStorage()
    expect(localStorage.getItem('hb_genre')).toBe('jazz')
    expect(localStorage.getItem('hb_volume')).toBe('{"level":0.4,"muted":false}')
    expect(localStorage.getItem('hb_place')).toBe('{"name":"Sydney"}')
  })
})
