import './style.css'
import type { Conditions, Coords } from './types'
import { resolveConditions } from './conditions/provider'
import { getBrowserLocation, reverseGeocode } from './conditions/location'
import { fetchWeatherDetail, type WeatherDetail } from './conditions/weather'
import { match } from './matcher/matcher'
import { signature } from './conditions/descriptors'
import { applyPalette } from './ui/backdrop'
import { buildControls, formatConditions } from './ui/controls'
import { buildDiagnostics, type Diagnostics } from './ui/diagnostics'
import { buildPlayer } from './ui/player'
import { buildAccount } from './ui/account'
import { buildLogin } from './ui/login'
import { fetchProfile, type SpotifyProfile } from './spotify/profile-api'
import { handleRedirect, isLoggedIn, beginLogin, getAccessToken, logout } from './spotify/auth'
import { searchPlaylists } from './spotify/search-api'
import { createAutoPlaylists } from './spotify/auto-playlist'
import { initPlayer, type PlayerHandle } from './spotify/player'
import { fadeVolume, VOLUME } from './spotify/fade'
import { playPlaylist } from './spotify/playback-api'
import { SPOTIFY_CLIENT_ID } from './config/spotify'
import { debug } from './debug'

const TICK_MS = 1000
const WEATHER_POLL_MS = 10 * 60 * 1000

async function boot() {
  const backdrop = document.getElementById('backdrop')!
  const overlay = document.getElementById('overlay')!

  if (!SPOTIFY_CLIENT_ID) {
    overlay.hidden = false
    overlay.innerHTML =
      '<div class="login-card"><h2>Setup needed</h2><p>Add your Spotify Client ID to ' +
      '<code>src/config/spotify.ts</code>.</p></div>'
    return
  }

  try { await handleRedirect() } catch (e) { console.error('login failed', e) }

  let coords: Coords | null = null
  let source: Diagnostics['source'] = 'none'
  try { coords = await getBrowserLocation(); source = 'geolocation' } catch { coords = null }

  let weatherDetail: WeatherDetail | null = null
  let place: string | null = null

  async function fetchWeatherAndPlace(): Promise<void> {
    weatherDetail = null
    place = null
    if (coords) {
      try { weatherDetail = await fetchWeatherDetail(coords) } catch { weatherDetail = null }
      try { place = await reverseGeocode(coords) } catch { place = null }
    }
  }

  // Recompute sun/season locally (no network) each tick, reusing cached weather.
  function recompute(): Conditions {
    return resolveConditions({ now: () => new Date(), coords, weather: weatherDetail })
  }

  await fetchWeatherAndPlace()
  let base: Conditions = recompute()
  let lastQuery: string | null = null

  // Playlists come from searching the public Spotify catalogue per mood; the
  // choice is pinned for this session so moods return to the same playlist.
  const autoPlaylists = createAutoPlaylists({
    search: async (query) => {
      const token = await getAccessToken()
      if (!token) return []
      return searchPlaylists(token, query)
    },
    onQuery: (query, count) => {
      // The rung that satisfied the search is worth surfacing in diagnostics.
      if (count >= 3 || lastQuery === null) lastQuery = query
      debug('search rung', { query, count })
    },
  })

  let player: PlayerHandle | null = null
  let playerInit: Promise<void> | null = null
  let currentPlaylistId = ''
  let startingPlaylistId: string | null = null
  let started = false
  let autoplayWanted = false
  // The mood whose playlist is playing, and the one being switched to.
  // Signature of the conditions whose playlist is playing / being switched to.
  let playingKey: string | null = null
  let pendingKey: string | null = null

  function showLogin() {
    overlay.hidden = false
    buildLogin(overlay, { summary: currentSummary(), onLogin: () => beginLogin() })
  }

  function currentSummary(): string {
    return formatConditions(base)
  }

  // Initialise the SDK player once (idempotent, guards concurrent callers).
  function ensurePlayer(): Promise<void> {
    if (player) return Promise.resolve()
    if (playerInit) return playerInit
    playerInit = (async () => {
      try {
        debug('ensurePlayer: initialising SDK')
        player = await initPlayer(getAccessToken, {
          onState: (track, paused) => playerUI.update(track, paused),
          onAuthError: (msg) => {
            console.error('Spotify player error:', msg)
            logout()
            started = false
            profile = null
            account.update(null)
            showLogin()
          },
        })
      } catch (e) {
        console.error('Spotify player failed to load', e)
        return
      }
      debug('ensurePlayer: ready', { deviceId: player?.deviceId })
      // If play was pressed before the player was ready, start now.
      if (autoplayWanted) {
        autoplayWanted = false
        void playConditions(base)
      }
    })()
    return playerInit
  }

  async function ensurePlayerAndRender() {
    render()
    await ensurePlayer()
    render()
  }

  /**
   * Resolves the mood to a playlist and starts it. playingMood is only set on
   * a confirmed start, so a failed search or switch is retried on a later tick
   * rather than being silently treated as done.
   */
  async function playConditions(c: Conditions): Promise<void> {
    const key = signature(c)
    debug('playConditions', { key, pendingKey, playingKey, started, hasPlayer: !!player })
    if (pendingKey === key) return
    pendingKey = key
    try {
      const playlist = await autoPlaylists.resolve(c)
      debug('resolved playlist', playlist)
      if (!playlist) {
        console.error(`no playable playlist found for: ${key}`)
        return
      }
      await startPlaylist(playlist.id)
      if (currentPlaylistId === playlist.id) playingKey = key
      updateDiagnostics()
    } finally {
      if (pendingKey === key) pendingKey = null
    }
  }

  function render() {
    const result = match(base)
    applyPalette(backdrop, result.palette)
    controls.update(base)
    // Once playing, any change in conditions resolves a playlist and switches.
    if (started && player && signature(base) !== playingKey) void playConditions(base)
    updateDiagnostics()
  }

  // Each switch claims a generation; an older in-flight fade sees it is no
  // longer current and drops out rather than fighting the newer one.
  let fadeGeneration = 0

  async function startPlaylist(playlistId: string) {
    if (startingPlaylistId === playlistId) return // already starting this one (guards rapid ticks)
    startingPlaylistId = playlistId
    const generation = ++fadeGeneration
    const isCurrent = () => generation === fadeGeneration
    try {
      const token = await getAccessToken()
      debug('startPlaylist: preflight', {
        playlistId, hasToken: !!token, hasPlayer: !!player, deviceId: player?.deviceId,
      })
      if (!token || !player) { showLogin(); return }
      const p = player

      // Fade out only if something is already audible — otherwise the first
      // press would sit through a silent ramp before anything happened.
      if (started) await fadeVolume((v) => p.setVolume(v), VOLUME, 0, { isCurrent })
      if (!isCurrent()) return

      await p.setVolume(0)
      await playPlaylist(token, p.deviceId, playlistId)
      debug('startPlaylist: play request accepted', playlistId)
      started = true
      currentPlaylistId = playlistId

      if (isCurrent()) await fadeVolume((v) => p.setVolume(v), 0, VOLUME, { isCurrent })
    } catch (e) {
      console.error('could not start playlist', e)
      // Never leave the player silent because a switch failed mid-fade.
      if (isCurrent()) await player?.setVolume(VOLUME).catch(() => {})
    } finally {
      startingPlaylistId = null
    }
  }

  const playerUI = buildPlayer(document.getElementById('player')!, {
    onToggle: () => {
      debug('toggle: clicked', { started, hasPlayer: !!player })
      if (!started) {
        player?.activate() // gesture → unlock audio, then play
        void playConditions(base)
      } else player?.togglePlay()
    },
    onNext: () => player?.next(),
    onPrev: () => player?.previous(),
  })

  const controls = buildControls(document.getElementById('controls')!)

  const account = buildAccount(document.getElementById('account-slot')!, {
    onSignIn: () => beginLogin(),
    onSignOut: () => {
      logout()
      // Full reload is the honest reset: it drops the SDK device, the pinned
      // playlist choices and every in-flight fade along with the token.
      window.location.reload()
    },
  })

  let profile: SpotifyProfile | null = null

  async function refreshProfile(): Promise<void> {
    const token = await getAccessToken()
    if (!token) { profile = null; account.update(null); return }
    try {
      profile = await fetchProfile(token)
    } catch (e) {
      console.error('could not load profile', e)
      profile = null
    }
    account.update(profile)
    if (profile && profile.product !== 'premium') {
      console.warn(`Spotify account is "${profile.product}" — playback needs premium`)
    }
  }

  const diagnostics = buildDiagnostics(document.getElementById('diagnostics')!)

  function updateDiagnostics() {
    diagnostics.update({
      now: new Date(),
      phase: base.phase,
      season: base.season,
      sunrise: weatherDetail?.sun?.sunrise ?? null,
      sunset: weatherDetail?.sun?.sunset ?? null,
      cloudCover: weatherDetail?.cloudCover ?? null,
      precipitationMm: weatherDetail?.precipitationMm ?? null,
      query: lastQuery,
      source,
      coords,
      place,
      weatherCode: weatherDetail?.code ?? null,
      weatherKind: weatherDetail?.kind ?? null,
      temperatureC: weatherDetail?.temperatureC ?? null,
    })
  }

  render()

  void refreshProfile()

  if (!isLoggedIn()) showLogin()
  else await ensurePlayerAndRender()

  // Real-time tick: recompute clock/time-of-day/season every second (local, no
  // network) so the clock ticks and the mood/playlist switch right at boundaries.
  setInterval(async () => {
    base = recompute()
    render()
  }, TICK_MS)

  // Weather poll: refresh the actual weather fetch on a slower cadence.
  setInterval(async () => {
    if (!coords) return
    await fetchWeatherAndPlace()
    base = recompute()
    render()
  }, WEATHER_POLL_MS)
}

boot().catch((e) => console.error('boot failed', e))
