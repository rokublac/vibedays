import './style.css'
import type { Conditions, Coords } from './types'
import { resolveConditions } from './conditions/provider'
import { getBrowserLocation, reverseGeocode, geocodeCity } from './conditions/location'
import { loadPlace, savePlace, clearPlace } from './config/place'
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
import { buildLogin, buildPremiumNotice, buildAccessNotice } from './ui/login'
import { fetchProfile, ProfileError, type SpotifyProfile } from './spotify/profile-api'
import { handleRedirect, isLoggedIn, beginLogin, getAccessToken, logout } from './spotify/auth'
import { searchPlaylists } from './spotify/search-api'
import { createAutoPlaylists } from './spotify/auto-playlist'
import { initPlayer, type PlayerHandle } from './spotify/player'
import { fadeVolume } from './spotify/fade'
import { loadVolume, saveVolume, effective, type VolumeState } from './config/volume'
import { canSetVolume } from './ui/audio-capability'
import { buildVolume } from './ui/volume'
import { playPlaylist, fetchTrackCount, randomStart, setShuffle } from './spotify/playback-api'
import { SPOTIFY_CLIENT_ID } from './config/spotify'
import { debug } from './debug'

const TICK_MS = 1000
const WEATHER_POLL_MS = 10 * 60 * 1000

/** Fades the boot screen out once there is something worth looking at. */
function hideBoot(): void {
  const boot = document.getElementById('boot')
  if (!boot || boot.classList.contains('is-done')) return
  boot.classList.add('is-done')
  setTimeout(() => boot.remove(), 500)
}

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

  // Surfaced on the login card rather than swallowed: a failed exchange used to
  // leave the page looking signed out with no explanation.
  let loginError: string | null = null
  try {
    await handleRedirect()
  } catch (e) {
    console.error('login failed', e)
    loginError = 'The sign-in did not complete. Please try again.'
  }

  let coords: Coords | null = null
  let source: Diagnostics['source'] = 'none'
  let place: string | null = null
  try {
    coords = await getBrowserLocation()
    source = 'geolocation'
  } catch {
    // Fall back to a city the user named previously, so a refused permission
    // does not have to be answered again on every visit.
    const saved = loadPlace()
    if (saved) {
      coords = saved.coords
      place = saved.name
      source = 'city'
    } else {
      coords = null
    }
  }

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
    buildLogin(overlay, {
      summary: currentSummary(),
      located: base.located,
      error: loginError,
      onLogin: () => startLogin(),
    })
  }

  function showAccessDenied() {
    overlay.hidden = false
    buildAccessNotice(overlay, {
      displayName: profile?.displayName ?? null,
      onSignOut: () => { logout(); window.location.reload() },
    })
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
            issue = `player ${kind}: ${msg || 'no message'}`
            updateDiagnostics()
            started = false
            // A free plan is not a bad token. Clearing it would send the user
            // back to the login screen, where signing in again changes nothing.
            if (kind === 'account') { showPremiumRequired(); return }
            logout()
            profile = null
            account.update(null)
            showLogin()
          },
        }, effective(volume))
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

  let volume: VolumeState = loadVolume()

  // Declared here but assigned further down, after buildPlayer has rendered
  // #volume-slot. applyVolume only reads it at call time.
  let volumeUI: ReturnType<typeof buildVolume> | null = null

  /**
   * How far through a fade the player is, 0..1. The volume actually sent to
   * the SDK is this times the listener's level, so a drag mid-crossfade takes
   * effect at once instead of being overwritten by the next ramp step.
   */
  let fadeFraction = 1

  /** Pushes the current fraction × level at the SDK. */
  function pushVolume(): Promise<void> {
    return player?.setVolume(fadeFraction * effective(volume)) ?? Promise.resolve()
  }

  function applyVolume(next: VolumeState): void {
    volume = next
    saveVolume(next)
    volumeUI?.update(next)
    // Before the player exists there is nothing to push to; the stored level is
    // picked up by the SDK constructor when it initialises.
    void pushVolume().catch(() => {})
  }

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

      // Ramps a fraction rather than an absolute volume: the listener's level
      // is a separate multiplier, so a drag during the fade is not clobbered.
      const ramp = (f: number) => {
        fadeFraction = f
        return p.setVolume(f * effective(volume))
      }

      // Fade out only if something is already audible — otherwise the first
      // press would sit through a silent ramp before anything happened.
      if (started) await fadeVolume(ramp, 1, 0, { isCurrent })
      if (!isCurrent()) return

      await ramp(0)

      // Start somewhere inside the playlist rather than always on track one,
      // then hand the rest of the queue to Spotify's own shuffle.
      const total = await fetchTrackCount(token, playlistId)
      const position = randomStart(total, Math.random)
      await playPlaylist(token, p.deviceId, playlistId, fetch, position)
      debug('startPlaylist: play request accepted', { playlistId, position, total })
      void setShuffle(token, p.deviceId, true).then((ok) => debug('shuffle set', ok))

      started = true
      currentPlaylistId = playlistId

      if (isCurrent()) await fadeVolume(ramp, 0, 1, { isCurrent })
    } catch (e) {
      console.error('could not start playlist', e)
      issue = `playback: ${e instanceof Error ? e.message : String(e)}`
      updateDiagnostics()
      // Never leave the player silent because a switch failed mid-fade.
      if (isCurrent()) {
        fadeFraction = 1
        await pushVolume().catch(() => {})
      }
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

  if (canSetVolume()) {
    volumeUI = buildVolume(document.getElementById('volume-slot')!, {
      // Dragging to zero is muting: leaving the two as separate states lets the
      // icon and the sound disagree.
      onChange: (level) => applyVolume({ level, muted: level === 0 }),
      onToggleMute: () => applyVolume({ ...volume, muted: !volume.muted }),
    })
    volumeUI.update(volume)
  }

  const controls = buildControls(document.getElementById('controls')!, {
    onRetryLocation: () => void retryLocation(),
    onUseCity: (name) => useCity(name),
  })

  /** Resolves a typed city and adopts it as the location. Throws if not found. */
  async function useCity(name: string): Promise<void> {
    const found = await geocodeCity(name)
    coords = found
    source = 'city'
    savePlace({ name, coords: found })
    // The typed name is better than a reverse lookup here: it is what the user
    // asked for, and it saves a request.
    place = name
    await refreshWeather()
    base = recompute()
    render()
  }

  /**
   * Re-asks for location. Only useful after the user has changed the site
   * permission: a blocked prompt does not reappear on request.
   */
  async function retryLocation(): Promise<void> {
    try {
      coords = await getBrowserLocation()
      source = 'geolocation'
      // Real coordinates beat a typed city, so stop remembering the fallback.
      clearPlace()
      place = null
    } catch {
      return
    }
    await refreshWeather()
    void fetchPlaceOnce()
    base = recompute()
    render()
  }

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

  /** beginLogin can reject before it ever navigates, so never fire and forget. */
  function startLogin(): void {
    beginLogin().catch((e) => {
      console.error('could not start login', e)
      loginError = e instanceof Error ? e.message : String(e)
      showLogin()
    })
  }

  const account = buildAccount(document.getElementById('account-slot')!, {
    onSignIn: () => startLogin(),
    onAbout: () => showAbout(),
    onSignOut: () => {
      logout()
      // Full reload is the honest reset: it drops the SDK device, the pinned
      // playlist choices and every in-flight fade along with the token.
      window.location.reload()
    },
  })

  let profile: SpotifyProfile | null = null
  /** Surfaced in the diagnostics panel; a phone has no console to read. */
  let issue: string | null = null

  /**
   * What the profile call tells us about the session. Signing in successfully
   * is not the same as being able to use the app: Spotify will hand out a
   * perfectly good token to an account its dashboard then refuses.
   */
  type ProfileState =
    | { kind: 'ok'; profile: SpotifyProfile }
    | { kind: 'no-token' }
    | { kind: 'not-registered' }
    | { kind: 'expired' }
    | { kind: 'unreachable'; message: string }

  async function loadProfile(): Promise<ProfileState> {
    const token = await getAccessToken()
    if (!token) { profile = null; account.update(null); return { kind: 'no-token' } }
    try {
      profile = await fetchProfile(token)
      account.update(profile)
      issue = null
      return { kind: 'ok', profile }
    } catch (e) {
      console.error('could not load profile', e)
      issue = `profile: ${e instanceof Error ? e.message : String(e)}`
      profile = null
      account.update(null)
      if (e instanceof ProfileError) {
        // 403 means the token is fine but the account is not allowed in.
        if (e.status === 403) return { kind: 'not-registered' }
        if (e.status === 401) return { kind: 'expired' }
      }
      return { kind: 'unreachable', message: e instanceof Error ? e.message : String(e) }
    }
  }

  const diagnostics = buildDiagnostics(document.getElementById('diagnostics')!)

  function updateDiagnostics() {
    diagnostics.update({
      issue,
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
  hideBoot()

  if (!isLoggedIn()) {
    showLogin()
  } else {
    // Nothing starts until we know the session is actually usable. Booting the
    // player first left the app looking signed in while every call failed.
    const state = await loadProfile()
    switch (state.kind) {
      case 'not-registered':
        showAccessDenied()
        break
      case 'expired':
        // The token is dead, so stop claiming to be signed in.
        logout()
        loginError = 'Your session expired. Please sign in again.'
        showLogin()
        break
      case 'no-token':
        logout()
        showLogin()
        break
      case 'unreachable':
        loginError = `Could not reach Spotify: ${state.message}`
        showLogin()
        break
      case 'ok':
        // Catch the free tier before the SDK does, so the failure is explained
        // rather than appearing as a bounce back to the login screen.
        if (state.profile.product && state.profile.product !== 'premium') showPremiumRequired()
        else await ensurePlayerAndRender()
        break
    }
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

// Never leave the loader up: a failed boot should show whatever rendered.
boot().catch((e) => {
  console.error('boot failed', e)
  hideBoot()
})
