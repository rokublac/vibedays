import { VOLUME } from './fade'

interface WebPlaybackImage {
  url: string
  height: number | null
  width: number | null
}
interface WebPlaybackTrack {
  id: string | null
  uri: string
  name: string
  artists: Array<{ name: string }>
  album?: { images?: WebPlaybackImage[] }
}
export interface WebPlaybackState {
  paused: boolean
  track_window: { current_track: WebPlaybackTrack | null }
  context?: {
    uri?: string | null
    metadata?: { context_description?: string | null } | null
  } | null
}

/** Where playback is coming from — the playlist, album or artist. */
export interface PlaybackContext {
  label: string
  url: string | null
}

/** What the now-playing card needs, flattened out of the SDK's state payload. */
export interface TrackInfo {
  name: string
  artists: string
  artworkUrl: string | null
  url: string | null
  context: PlaybackContext | null
}

/**
 * Album art comes in ~640/300/64 sizes. The card renders at 80px, so the
 * smallest image at least 160px wide is the cheapest one that stays sharp on
 * a 2x display; fall back to the largest if the sizes are missing.
 */
export function pickArtwork(images: WebPlaybackImage[] | undefined): string | null {
  if (!images?.length) return null
  const sized = images.filter((i) => typeof i.width === 'number')
  if (!sized.length) return images[0].url
  const ascending = [...sized].sort((a, b) => (a.width ?? 0) - (b.width ?? 0))
  return (ascending.find((i) => (i.width ?? 0) >= 160) ?? ascending[ascending.length - 1]).url
}

/** `spotify:track:abc` → the open.spotify.com permalink the card links to. */
export function trackUrl(track: { id: string | null; uri: string }): string | null {
  const id = track.id ?? (track.uri.startsWith('spotify:track:') ? track.uri.slice(14) : null)
  return id ? `https://open.spotify.com/track/${id}` : null
}

/** `spotify:playlist:abc` → `https://open.spotify.com/playlist/abc`. */
export function contextUrl(uri: string | null | undefined): string | null {
  const parts = (uri ?? '').split(':')
  if (parts.length !== 3 || parts[0] !== 'spotify' || !parts[2]) return null
  return `https://open.spotify.com/${parts[1]}/${parts[2]}`
}

/**
 * Reads the source of playback from the SDK rather than from our own mood map,
 * so it stays correct if playback is redirected from another Spotify client.
 * context_description is not always populated, hence the uri-derived fallback.
 */
export function contextInfo(state: WebPlaybackState | null): PlaybackContext | null {
  const ctx = state?.context
  if (!ctx) return null
  const url = contextUrl(ctx.uri)
  const described = ctx.metadata?.context_description?.trim()
  const kind = (ctx.uri ?? '').split(':')[1] // 'playlist' | 'album' | 'artist'
  const label = described || (kind ? kind : '')
  if (!label) return null
  return { label, url }
}

export function trackInfo(state: WebPlaybackState | null): TrackInfo | null {
  const t = state?.track_window?.current_track
  if (!t) return null
  return {
    name: t.name,
    artists: t.artists.map((a) => a.name).join(', '),
    artworkUrl: pickArtwork(t.album?.images),
    url: trackUrl(t),
    context: contextInfo(state),
  }
}

export interface PlayerHandle {
  deviceId: string
  activate(): Promise<void>
  setVolume(v: number): Promise<void>
  togglePlay(): void
  next(): void
  previous(): void
}

export interface PlayerCallbacks {
  onState(track: TrackInfo | null, paused: boolean): void
  onAuthError(message: string): void
}

interface SpotifyPlayer {
  addListener(event: string, cb: (payload: unknown) => void): void
  connect(): Promise<boolean>
  activateElement(): Promise<void>
  togglePlay(): Promise<void>
  nextTrack(): Promise<void>
  previousTrack(): Promise<void>
  setVolume(volume: number): Promise<void>
}

declare global {
  interface Window {
    onSpotifyWebPlaybackSDKReady?: () => void
    Spotify?: {
      Player: new (opts: {
        name: string
        getOAuthToken: (cb: (token: string) => void) => void
        volume?: number
      }) => SpotifyPlayer
    }
  }
}

export function initPlayer(
  getToken: () => Promise<string | null>,
  callbacks: PlayerCallbacks,
): Promise<PlayerHandle> {
  return new Promise((resolve, reject) => {
    window.onSpotifyWebPlaybackSDKReady = () => {
      const player = new window.Spotify!.Player({
        name: 'HopeBridge Lofi',
        getOAuthToken: (cb) => {
          getToken().then((t) => cb(t ?? ''))
        },
        volume: VOLUME,
      })

      player.addListener('ready', (payload) => {
        const { device_id } = payload as { device_id: string }
        resolve({
          deviceId: device_id,
          activate: () => player.activateElement(),
          setVolume: (v) => player.setVolume(v),
          togglePlay: () => void player.togglePlay(),
          next: () => void player.nextTrack(),
          previous: () => void player.previousTrack(),
        })
      })

      player.addListener('player_state_changed', (payload) => {
        const state = payload as WebPlaybackState | null
        callbacks.onState(trackInfo(state), state?.paused ?? true)
      })

      const authErr = (payload: unknown) =>
        callbacks.onAuthError((payload as { message: string }).message)
      player.addListener('authentication_error', authErr)
      player.addListener('account_error', authErr)
      player.addListener('initialization_error', authErr)

      player.connect()
    }

    const script = document.createElement('script')
    script.src = 'https://sdk.scdn.co/spotify-player.js'
    script.async = true
    script.onerror = () => reject(new Error('Spotify Web Playback SDK failed to load'))
    document.body.appendChild(script)
  })
}
