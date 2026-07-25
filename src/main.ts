import './style.css'
import type { Conditions, Coords } from './types'
import { resolveConditions } from './conditions/provider'
import { getBrowserLocation, reverseGeocode } from './conditions/location'
import { fetchWeatherDetail } from './conditions/weather'
import { createWeatherStore } from './conditions/weather-store'
import { match } from './matcher/matcher'
import { signature } from './conditions/descriptors'
import { applyPalette } from './ui/backdrop'
import { buildControls, formatConditions } from './ui/controls'
import { buildDiagnostics, type Diagnostics } from './ui/diagnostics'
import { buildPlayer } from './ui/player'
import { buildAccount } from './ui/account'
import { buildGenrePicker } from './ui/genre'
import { buildAbout } from './ui/about'
import { loadGenre, saveGenre, type Genre } from './config/genres'
import { buildLogin, buildPremiumNotice } from './ui/login'
import { fetchProfile, type SpotifyProfile } from './spotify/profile-api'
import { handleRedirect, isLoggedIn, beginLogin, getAccessToken, logout } from './spotify/auth'
import { searchPlaylists } from './spotify/search-api'
import { createAutoPlaylists } from './spotify/auto-playlist'
import { initPlayer, type PlayerHandle } from './spotify/player'
import { fadeVolume, VOLUME } from './spotify/fade'
import { playPlaylist, fetchTrackCount, randomStart, setShuffle } from './spotify/playback-api'
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
      '<div class="login-card"><h2>Setup needed</h2>' +
      '<p>Copy <code>.env.example</code> to <code>.env</code> and add your Spotify ' +
      'Client ID as <code>VITE_SPOTIFY_CLIENT_ID</code>, then restart the dev server.</p>' +
      '<p class="fineprint">See the README for the full setup.</p></div>'
    return
  }

  try { await handleRedirect() } catch (e) { console.error('login failed', e) }

  let coords: Coords | null = null
  let source: Diagnostics['source'] = 'none'
  try { coords = await getBrowserLocation(); source = 'geolocation' } catch { coords = null }

  let place: string | null = null

  // Holds the last good reading so a refresh in flight never leaves the app
  // weatherless; see weather-store.ts for why that mattered.
  const weather = createWeatherStore(
    () => fetchWeatherDetail(coords!),
    (e) => debug('weather refresh failed, keeping previous', e),
  )
  const refreshWeather = () => (coords ? weather.refresh() : Promise.resolve())

  /** The coordinates never change after boot, so neither can the place name. */
  async function fetchPlaceOnce(): Promise<void> {
    if (!coords || place !== null) return
    try { place = await reverseGeocode(coords) } catch { place = null }
  }

  // Recompute sun/season locally (no network) each tick, reusing cached weather.
  function recompute(): Conditions {
    return resolveConditions({ now: () => new Date(), coords, weather: weather.current() })
  }

  await refreshWeather()
  void fetchPlaceOnce() // display only, so it need not hold up the first render
  let base: Conditions = recompute()

  let genre: Genre = loadGenre()

  // Playlists come from searching the public Spotify catalogue per mood; the
  // choice is pinned for this session so moods return to the same playlist.
  const autoPlaylists = createAutoPlaylists({
    genre: () => genre,
    search: async (query, offset) => {
      const token = await getAccessToken()
      if (!token) return []
      return searchPlaylists(token, query, fetch, undefined, offset)
    },
    onQuery: (query, count) => debug('search rung', { query, count }),
  })

  let player: PlayerHandle | null = null
  let playerInit: Promise<void> | null = null
  let currentPlaylistId = ''
  let startingPlaylistId: string | null = null
  let started = false
  let autoplayWanted = false
  // The mood whose playlist is playing, and the one being switched to.
  // Genre plus conditions: switching genre must count as a change, or the
  // render tick would see the same key and never start the new music.
  const keyFor = (c: Conditions) => `${genre.id}|${signature(c)}`
  let playingKey: string | null = null
  let pendingKey: string | null = null

  function showLogin() {
    overlay.hidden = false
    buildLogin(overlay, { summary: currentSummary(), onLogin: () => beginLogin() })
  }

  function showPremiumRequired() {
    overlay.hidden = false
    buildPremiumNotice(overlay, {
      displayName: profile?.displayName ?? null,
      onSignOut: () => { logout(); window.location.reload() },
    })
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
          onFatal: (kind, msg) => {
            console.error(`Spotify player ${kind} error:`, msg)
            started = false
            // A free plan is not a bad token. Clearing it would send the user
            // back to the login screen, where signing in again changes nothing.
            if (kind === 'account') { showPremiumRequired(); return }
            logout()
            profile = null
            account.update(null)
            showLogin()
          },
        })
      } catch (e) {
        console.error('Spotify player failed to load', e)
        // Allow a later attempt (e.g. after switching to a Premium account)
        // instead of caching a rejected promise forever.
        playerInit = null
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
    const key = keyFor(c)
    debug('playConditions', { key, pendingKey, playingKey, started, hasPlayer: !!player })
    if (pendingKey === key) return
    pendingKey = key
    setBusy(1)
    try {
      const playlist = await autoPlaylists.resolve(c)
      debug('resolved playlist', playlist)
      if (!playlist) {
        console.error(`no playable playlist found for: ${key}`)
        return
      }
      await startPlaylist(playlist.id)
      if (currentPlaylistId === playlist.id) playingKey = key
      playerUI.setAlternatives(autoPlaylists.poolSize(c))
      updateDiagnostics()
    } finally {
      setBusy(-1)
      if (pendingKey === key) pendingKey = null
    }
  }

  // Counted rather than a flag: a condition change and a manual switch can
  // overlap, and the first one to finish must not clear the other's indicator.
  let busyCount = 0
  function setBusy(delta: number) {
    busyCount = Math.max(0, busyCount + delta)
    playerUI.setBusy(busyCount > 0)
    genrePicker.setBusy(busyCount > 0)
  }

  /** Swap to another playlist for the conditions already playing. */
  async function rerollPlaylist(): Promise<void> {
    if (!player) return
    setBusy(1)
    try {
      const playlist = await autoPlaylists.reroll(base)
      debug('reroll', playlist)
      if (playlist) await startPlaylist(playlist.id)
      playerUI.setAlternatives(autoPlaylists.poolSize(base))
    } catch (e) {
      console.error('could not switch playlist', e)
    } finally {
      setBusy(-1)
    }
  }

  function render() {
    const result = match(base)
    applyPalette(backdrop, result.palette)
    controls.update(base)
    // Once playing, any change in conditions resolves a playlist and switches.
    if (started && player && keyFor(base) !== playingKey) void playConditions(base)
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

      // Start somewhere inside the playlist rather than always on track one,
      // then hand the rest of the queue to Spotify's own shuffle.
      const total = await fetchTrackCount(token, playlistId)
      const position = randomStart(total, Math.random)
      await playPlaylist(token, p.deviceId, playlistId, fetch, position)
      debug('startPlaylist: play request accepted', { playlistId, position, total })
      void setShuffle(token, p.deviceId, true).then((ok) => debug('shuffle set', ok))

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
    onReroll: () => void rerollPlaylist(),
  })

  const controls = buildControls(document.getElementById('controls')!)

  const genrePicker = buildGenrePicker(document.getElementById('genre-slot')!, {
    onSelect: (next) => {
      if (next.id === genre.id) return
      genre = next
      saveGenre(next.id)
      genrePicker.update(genre)
      // Only chase it if something is already playing; otherwise the choice
      // simply applies whenever the user presses play.
      if (started) void playConditions(base)
    },
  })
  genrePicker.update(genre)

  const modal = document.getElementById('modal')!
  const closeModal = () => { modal.hidden = true; modal.innerHTML = '' }
  // Dismiss on the scrim, not the card.
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal() })
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) closeModal()
  })

  function showAbout() {
    buildAbout(modal, { onClose: closeModal })
    modal.hidden = false
    modal.querySelector<HTMLButtonElement>('#about-close')!.focus()
  }

  const account = buildAccount(document.getElementById('account-slot')!, {
    onSignIn: () => beginLogin(),
    onAbout: () => showAbout(),
    onSignOut: () => {
      logout()
      // Full reload is the honest reset: it drops the SDK device, the pinned
      // playlist choices and every in-flight fade along with the token.
      window.location.reload()
    },
  })

  let profile: SpotifyProfile | null = null

  async function refreshProfile(): Promise<SpotifyProfile | null> {
    const token = await getAccessToken()
    if (!token) { profile = null; account.update(null); return null }
    try {
      profile = await fetchProfile(token)
    } catch (e) {
      console.error('could not load profile', e)
      profile = null
    }
    account.update(profile)
    return profile
  }

  const diagnostics = buildDiagnostics(document.getElementById('diagnostics')!)

  function updateDiagnostics() {
    diagnostics.update({
      now: new Date(),
      phase: base.phase,
      season: base.season,
      sunrise: weather.current()?.sun?.sunrise ?? null,
      sunset: weather.current()?.sun?.sunset ?? null,
      cloudCover: weather.current()?.cloudCover ?? null,
      precipitationMm: weather.current()?.precipitationMm ?? null,
      source,
      coords,
      place,
      weatherCode: weather.current()?.code ?? null,
      weatherKind: weather.current()?.kind ?? null,
      temperatureC: weather.current()?.temperatureC ?? null,
    })
  }

  render()

  if (!isLoggedIn()) {
    showLogin()
  } else {
    const me = await refreshProfile()
    // Catch the free tier before the SDK does, so the failure is explained
    // rather than appearing as a bounce back to the login screen.
    if (me && me.product && me.product !== 'premium') showPremiumRequired()
    else await ensurePlayerAndRender()
  }

  // Real-time tick: recompute clock/time-of-day/season every second (local, no
  // network) so the clock ticks and the mood/playlist switch right at boundaries.
  setInterval(async () => {
    base = recompute()
    render()
  }, TICK_MS)

  // Weather poll: refresh the actual weather fetch on a slower cadence.
  setInterval(async () => {
    if (!coords) return
    await refreshWeather()
    void fetchPlaceOnce() // no-op once it has resolved
    base = recompute()
    render()
  }, WEATHER_POLL_MS)
}

boot().catch((e) => console.error('boot failed', e))
