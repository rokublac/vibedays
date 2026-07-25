/**
 * Spotify app configuration.
 *
 * The Client ID is a PUBLIC identifier and PKCE needs no client secret, so
 * there is nothing secret in this file. It still comes from the environment
 * rather than being hardcoded, so everyone runs against their own Spotify app
 * with their own registered redirect URIs.
 *
 * Copy .env.example to .env and put your own Client ID there.
 */
export const SPOTIFY_CLIENT_ID: string = import.meta.env.VITE_SPOTIFY_CLIENT_ID ?? ''

export const SPOTIFY_SCOPES =
  'streaming user-read-email user-read-private user-modify-playback-state user-read-playback-state'

/** Must exactly match a Redirect URI registered on your Spotify app. */
export function redirectUri(): string {
  return window.location.origin + '/'
}
