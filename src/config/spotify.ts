// Paste your Spotify app Client ID here (from developer.spotify.com/dashboard).
// It is a PUBLIC identifier — safe to commit; PKCE needs no secret.
export const SPOTIFY_CLIENT_ID = '7b72aa4690b742818590af9ae2b5df31'
export const SPOTIFY_SCOPES =
  'streaming user-read-email user-read-private user-modify-playback-state user-read-playback-state playlist-read-private'

// Must exactly match a Redirect URI registered on the Spotify app.
export function redirectUri(): string {
  return window.location.origin + '/'
}
