import { SPOTIFY_CLIENT_ID, SPOTIFY_SCOPES, redirectUri } from '../config/spotify'

export interface Tokens {
  accessToken: string
  refreshToken: string
  expiresAt: number
}

const TOKEN_KEY = 'lwp_tokens_v2'
const VERIFIER_KEY = 'lwp_pkce_verifier'
const AUTHORIZE = 'https://accounts.spotify.com/authorize'
const TOKEN_URL = 'https://accounts.spotify.com/api/token'
const UNRESERVED = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'

export function generateCodeVerifier(length = 64): string {
  const values = crypto.getRandomValues(new Uint8Array(length))
  let out = ''
  for (const v of values) out += UNRESERVED[v % UNRESERVED.length]
  return out
}

function base64url(bytes: Uint8Array): string {
  let str = ''
  for (const b of bytes) str += String.fromCharCode(b)
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  return base64url(new Uint8Array(digest))
}

export function buildAuthUrl(p: {
  clientId: string; redirectUri: string; scope: string; challenge: string; state: string
}): string {
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: p.clientId,
    scope: p.scope,
    redirect_uri: p.redirectUri,
    code_challenge_method: 'S256',
    code_challenge: p.challenge,
    state: p.state,
  })
  return `${AUTHORIZE}?${q.toString()}`
}

export function saveTokens(t: Tokens): void {
  localStorage.setItem(TOKEN_KEY, JSON.stringify(t))
}

export function loadTokens(): Tokens | null {
  const raw = localStorage.getItem(TOKEN_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as Tokens
  } catch {
    return null
  }
}

export function isLoggedIn(): boolean {
  return loadTokens() !== null
}

export function logout(): void {
  localStorage.removeItem(TOKEN_KEY)
}

export async function exchangeCodeForTokens(
  args: { code: string; verifier: string; clientId: string; redirectUri: string },
  fetchFn: typeof fetch = fetch,
): Promise<Tokens> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: args.code,
    redirect_uri: args.redirectUri,
    client_id: args.clientId,
    code_verifier: args.verifier,
  })
  const res = await fetchFn(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) throw new Error(`token exchange failed: ${res.status}`)
  const d = await res.json()
  return {
    accessToken: d.access_token,
    refreshToken: d.refresh_token,
    expiresAt: Date.now() + d.expires_in * 1000,
  }
}

export async function refreshAccessToken(
  args: { refreshToken: string; clientId: string },
  fetchFn: typeof fetch = fetch,
): Promise<Tokens> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: args.refreshToken,
    client_id: args.clientId,
  })
  const res = await fetchFn(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) throw new Error(`token refresh failed: ${res.status}`)
  const d = await res.json()
  return {
    accessToken: d.access_token,
    refreshToken: d.refresh_token ?? args.refreshToken,
    expiresAt: Date.now() + d.expires_in * 1000,
  }
}

export async function getAccessToken(
  fetchFn: typeof fetch = fetch,
  now: number = Date.now(),
): Promise<string | null> {
  const t = loadTokens()
  if (!t) return null
  if (t.expiresAt - 30_000 > now) return t.accessToken
  try {
    const refreshed = await refreshAccessToken(
      { refreshToken: t.refreshToken, clientId: SPOTIFY_CLIENT_ID },
      fetchFn,
    )
    saveTokens(refreshed)
    return refreshed.accessToken
  } catch {
    return null
  }
}

export const INSECURE_CONTEXT_MESSAGE =
  'Signing in needs a secure connection. Open the site over https, or use '
  + 'localhost rather than a LAN address during development.'

export async function beginLogin(): Promise<void> {
  // PKCE needs crypto.subtle, which browsers only expose in a secure context.
  // Over plain http (a LAN IP on a phone, say) it is simply undefined, and the
  // button appeared to do nothing at all.
  if (!window.isSecureContext || !globalThis.crypto?.subtle) {
    throw new Error(INSECURE_CONTEXT_MESSAGE)
  }
  const verifier = generateCodeVerifier()
  localStorage.setItem(VERIFIER_KEY, verifier)
  const challenge = await codeChallenge(verifier)
  window.location.assign(
    buildAuthUrl({
      clientId: SPOTIFY_CLIENT_ID,
      redirectUri: redirectUri(),
      scope: SPOTIFY_SCOPES,
      challenge,
      state: 'lwp',
    }),
  )
}

export async function handleRedirect(fetchFn: typeof fetch = fetch): Promise<boolean> {
  const code = new URLSearchParams(window.location.search).get('code')
  if (!code) return false
  const verifier = localStorage.getItem(VERIFIER_KEY)
  if (!verifier) return false
  const tokens = await exchangeCodeForTokens(
    { code, verifier, clientId: SPOTIFY_CLIENT_ID, redirectUri: redirectUri() },
    fetchFn,
  )
  saveTokens(tokens)
  localStorage.removeItem(VERIFIER_KEY)
  history.replaceState({}, '', window.location.pathname)
  return true
}
