import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateCodeVerifier, codeChallenge, buildAuthUrl, saveTokens, loadTokens, isLoggedIn, exchangeCodeForTokens, refreshAccessToken, getAccessToken, type Tokens, beginLogin, INSECURE_CONTEXT_MESSAGE } from './auth'

beforeEach(() => localStorage.clear())

const okJson = (body: unknown) =>
  ({ ok: true, json: async () => body }) as unknown as Response

describe('generateCodeVerifier', () => {
  it('produces a 64-char unreserved string', () => {
    const v = generateCodeVerifier()
    expect(v).toHaveLength(64)
    expect(v).toMatch(/^[A-Za-z0-9\-._~]+$/)
  })
})

describe('codeChallenge', () => {
  it('matches the RFC 7636 test vector', async () => {
    const challenge = await codeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')
    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })
})

describe('buildAuthUrl', () => {
  it('includes PKCE + client params', () => {
    const url = buildAuthUrl({
      clientId: 'CID', redirectUri: 'http://127.0.0.1:5173/',
      scope: 'playlist-read-private', challenge: 'CH', state: 'st',
    })
    expect(url).toContain('https://accounts.spotify.com/authorize?')
    expect(url).toContain('client_id=CID')
    expect(url).toContain('code_challenge=CH')
    expect(url).toContain('code_challenge_method=S256')
    expect(url).toContain('response_type=code')
  })
})

describe('token storage', () => {
  it('round-trips and reports login state', () => {
    expect(isLoggedIn()).toBe(false)
    const t: Tokens = { accessToken: 'A', refreshToken: 'R', expiresAt: 123 }
    saveTokens(t)
    expect(loadTokens()).toEqual(t)
    expect(isLoggedIn()).toBe(true)
  })
})

describe('exchangeCodeForTokens', () => {
  it('POSTs the code and returns tokens', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      okJson({ access_token: 'A', refresh_token: 'R', expires_in: 3600 }),
    ) as unknown as typeof fetch
    const t = await exchangeCodeForTokens(
      { code: 'C', verifier: 'V', clientId: 'CID', redirectUri: 'http://127.0.0.1:5173/' },
      fetchFn,
    )
    expect(t.accessToken).toBe('A')
    expect(t.refreshToken).toBe('R')
    expect(t.expiresAt).toBeGreaterThan(Date.now())
    const [, init] = (fetchFn as any).mock.calls[0]
    expect(String(init.body)).toContain('grant_type=authorization_code')
  })
})

describe('getAccessToken', () => {
  it('returns the stored token when still valid', async () => {
    saveTokens({ accessToken: 'A', refreshToken: 'R', expiresAt: Date.now() + 60_000 })
    const token = await getAccessToken(vi.fn() as unknown as typeof fetch)
    expect(token).toBe('A')
  })
  it('refreshes when expired', async () => {
    saveTokens({ accessToken: 'OLD', refreshToken: 'R', expiresAt: Date.now() - 1000 })
    const fetchFn = vi.fn().mockResolvedValue(
      okJson({ access_token: 'NEW', expires_in: 3600 }),
    ) as unknown as typeof fetch
    const token = await getAccessToken(fetchFn)
    expect(token).toBe('NEW')
    expect(loadTokens()!.refreshToken).toBe('R') // reused when not returned
  })
  it('returns null when not logged in', async () => {
    expect(await getAccessToken(vi.fn() as unknown as typeof fetch)).toBeNull()
  })
})

describe('refreshAccessToken', () => {
  it('keeps the old refresh token when none is returned', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      okJson({ access_token: 'N', expires_in: 3600 }),
    ) as unknown as typeof fetch
    const t = await refreshAccessToken({ refreshToken: 'R', clientId: 'CID' }, fetchFn)
    expect(t.accessToken).toBe('N')
    expect(t.refreshToken).toBe('R')
  })
})

describe('beginLogin in an insecure context', () => {
  it('rejects with an explanation instead of doing nothing', async () => {
    // crypto.subtle is undefined over plain http, so PKCE cannot run. The
    // button previously appeared dead with no message anywhere.
    const secure = window.isSecureContext
    Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true })
    try {
      await expect(beginLogin()).rejects.toThrow(INSECURE_CONTEXT_MESSAGE)
    } finally {
      Object.defineProperty(window, 'isSecureContext', { value: secure, configurable: true })
    }
  })

  it('names https and localhost as the fix', () => {
    expect(INSECURE_CONTEXT_MESSAGE).toContain('https')
    expect(INSECURE_CONTEXT_MESSAGE).toContain('localhost')
  })
})
