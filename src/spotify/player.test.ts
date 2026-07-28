import { describe, it, expect } from 'vitest'
import { trackInfo, pickArtwork, trackUrl, contextInfo, contextUrl, initPlayer } from './player'
import { DEFAULT_VOLUME } from '../config/volume'

const track = (over: Record<string, unknown> = {}) => ({
  id: 'abc123',
  uri: 'spotify:track:abc123',
  name: 'Tonight',
  artists: [{ name: 'Brad Beal' }, { name: 'Zero' }],
  album: { images: [{ url: 'big.jpg', width: 640, height: 640 }, { url: 'small.jpg', width: 64, height: 64 }] },
  ...over,
})

describe('pickArtwork', () => {
  it('picks the smallest image at least 160px wide, for a sharp 80px card', () => {
    expect(pickArtwork([
      { url: 'x64.jpg', width: 64, height: 64 },
      { url: 'x300.jpg', width: 300, height: 300 },
      { url: 'x640.jpg', width: 640, height: 640 },
    ])).toBe('x300.jpg')
  })
  it('falls back to the largest when everything is too small', () => {
    expect(pickArtwork([
      { url: 'x64.jpg', width: 64, height: 64 },
      { url: 'x150.jpg', width: 150, height: 150 },
    ])).toBe('x150.jpg')
  })
  it('uses the first image when widths are missing', () => {
    expect(pickArtwork([{ url: 'only.jpg', width: null, height: null }])).toBe('only.jpg')
  })
  it('returns null for missing or empty artwork', () => {
    expect(pickArtwork(undefined)).toBeNull()
    expect(pickArtwork([])).toBeNull()
  })
})

describe('trackUrl', () => {
  it('builds a permalink from the id', () => {
    expect(trackUrl({ id: 'abc123', uri: 'spotify:track:abc123' }))
      .toBe('https://open.spotify.com/track/abc123')
  })
  it('derives the id from the uri when id is null', () => {
    expect(trackUrl({ id: null, uri: 'spotify:track:xyz789' }))
      .toBe('https://open.spotify.com/track/xyz789')
  })
  it('returns null for a local file with no track id', () => {
    expect(trackUrl({ id: null, uri: 'spotify:local:foo' })).toBeNull()
  })
})

describe('trackInfo', () => {
  it('flattens the SDK state into what the card renders', () => {
    const info = trackInfo({ paused: false, track_window: { current_track: track() } })
    expect(info).toEqual({
      name: 'Tonight',
      artists: 'Brad Beal, Zero',
      artworkUrl: 'big.jpg',
      url: 'https://open.spotify.com/track/abc123',
      context: null,
    })
  })
  it('leaves artists empty when there are none', () => {
    expect(trackInfo({ paused: true, track_window: { current_track: track({ artists: [] }) } })?.artists)
      .toBe('')
  })
  it('returns null when there is no track', () => {
    expect(trackInfo(null)).toBeNull()
    expect(trackInfo({ paused: true, track_window: { current_track: null } })).toBeNull()
  })
})

describe('contextUrl', () => {
  it('builds a permalink from a playlist uri', () => {
    expect(contextUrl('spotify:playlist:p1')).toBe('https://open.spotify.com/playlist/p1')
  })
  it('handles album and artist contexts too', () => {
    expect(contextUrl('spotify:album:a1')).toBe('https://open.spotify.com/album/a1')
    expect(contextUrl('spotify:artist:x1')).toBe('https://open.spotify.com/artist/x1')
  })
  it('rejects malformed or missing uris', () => {
    expect(contextUrl(null)).toBeNull()
    expect(contextUrl(undefined)).toBeNull()
    expect(contextUrl('spotify:playlist:')).toBeNull()
    expect(contextUrl('not-a-uri')).toBeNull()
  })
})

describe('contextInfo', () => {
  const withContext = (context: unknown) =>
    ({ paused: false, track_window: { current_track: null }, context }) as never

  it('prefers the SDK description and links to the source', () => {
    expect(contextInfo(withContext({
      uri: 'spotify:playlist:p1',
      metadata: { context_description: 'Late night lofi' },
    }))).toEqual({ label: 'Late night lofi', url: 'https://open.spotify.com/playlist/p1' })
  })

  it('falls back to the context type when no description is given', () => {
    expect(contextInfo(withContext({ uri: 'spotify:playlist:p1', metadata: null })))
      .toEqual({ label: 'playlist', url: 'https://open.spotify.com/playlist/p1' })
  })

  it('ignores a whitespace-only description', () => {
    expect(contextInfo(withContext({
      uri: 'spotify:album:a1',
      metadata: { context_description: '   ' },
    }))?.label).toBe('album')
  })

  it('returns null when there is no context at all', () => {
    expect(contextInfo(withContext(null))).toBeNull()
    expect(contextInfo(null)).toBeNull()
  })

  it('keeps the label but drops the link when the uri is unusable', () => {
    expect(contextInfo(withContext({
      uri: null,
      metadata: { context_description: 'Recently played' },
    }))).toEqual({ label: 'Recently played', url: null })
  })
})

describe('initPlayer', () => {
  /** Minimal stand-in for the SDK's player object. */
  function fakeSdk() {
    const constructed: Array<{ volume?: number }> = []
    const listeners = new Map<string, (p: unknown) => void>()
    const player = {
      addListener: (e: string, c: (p: unknown) => void) => void listeners.set(e, c),
      connect: async () => true,
      activateElement: async () => {},
      togglePlay: async () => {},
      nextTrack: async () => {},
      previousTrack: async () => {},
      setVolume: async () => {},
    }
    return {
      constructed,
      listeners,
      Player: function (opts: { volume?: number }) {
        constructed.push(opts)
        return player
      } as unknown as NonNullable<Window['Spotify']>['Player'],
    }
  }

  /** Drives the SDK's ready handshake, which initPlayer waits on. */
  async function boot(initialVolume?: number) {
    const sdk = fakeSdk()
    window.Spotify = { Player: sdk.Player }
    const promise =
      initialVolume === undefined
        ? initPlayer(async () => 'token', { onState: () => {}, onFatal: () => {} })
        : initPlayer(async () => 'token', { onState: () => {}, onFatal: () => {} }, initialVolume)
    window.onSpotifyWebPlaybackSDKReady!()
    sdk.listeners.get('ready')!({ device_id: 'dev1' })
    await promise
    return sdk
  }

  it('starts the SDK at the level it was given', async () => {
    // Constructor rather than a setVolume afterwards, so the first note is
    // already at the listener's level instead of being corrected mid-note.
    const sdk = await boot(0.2)
    expect(sdk.constructed[0].volume).toBe(0.2)
  })

  it('falls back to the default when none is given', async () => {
    const sdk = await boot()
    expect(sdk.constructed[0].volume).toBe(DEFAULT_VOLUME)
  })
})
