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
import { buildControls } from './ui/controls'
import { buildDiagnostics, type Diagnostics } from './ui/diagnostics'
import { buildPlayer } from './ui/player'
import { buildGenrePicker } from './ui/genre'
import { buildAbout } from './ui/about'
import { loadGenre, saveGenre, type Genre } from './config/genres'
import { createAudiusSource } from './source/audius-source'
import type { MusicSource, Selection, SourceCallbacks } from './source/types'
import { fadeVolume } from './fade'
import { loadVolume, saveVolume, effective, type VolumeState } from './config/volume'
import { canSetVolume } from './ui/audio-capability'
import { buildVolume } from './ui/volume'
import { debug } from './debug'

const TICK_MS = 1000
const WEATHER_POLL_MS = 10 * 60 * 1000

/**
 * Clears what the Spotify version left behind. An access token is not
 * something to keep sitting in storage once nothing can use it, and a stale
 * source preference would otherwise linger forever.
 */
function clearLegacyStorage(): void {
  for (const key of ['lwp_tokens_v2', 'lwp_pkce_verifier', 'hb_source']) {
    try { localStorage.removeItem(key) } catch { /* private mode; nothing to clear */ }
  }
}

/** Fades the boot screen out once there is something worth looking at. */
function hideBoot(): void {
  const boot = document.getElementById('boot')
  if (!boot || boot.classList.contains('is-done')) return
  boot.classList.add('is-done')
  setTimeout(() => boot.remove(), 500)
}

async function boot() {
  clearLegacyStorage()

  const backdrop = document.getElementById('backdrop')!


  let coords: Coords | null = null
  let locationSource: Diagnostics['source'] = 'none'
  let place: string | null = null
  try {
    coords = await getBrowserLocation()
    locationSource = 'geolocation'
  } catch {
    // Fall back to a city the user named previously, so a refused permission
    // does not have to be answered again on every visit.
    const saved = loadPlace()
    if (saved) {
      coords = saved.coords
      place = saved.name
      locationSource = 'city'
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

  let volume: VolumeState = loadVolume()

  // Declared here but assigned after buildPlayer has rendered #volume-slot.
  // applyVolume only reads it at call time.
  let volumeUI: ReturnType<typeof buildVolume> | null = null

  /** Surfaced in the diagnostics panel; a phone has no console to read. */
  let issue: string | null = null

  const callbacks: SourceCallbacks = {
    onState: (track, paused) => playerUI.update(track, paused),
    onFatal: (kind, msg) => {
      // Nothing here needs an account, so a failure is reported and retried
      // rather than being treated as a session problem.
      console.error(`player ${kind} error:`, msg)
      issue = `player ${kind}: ${msg || 'no message'}`
      updateDiagnostics()
      started = false
    },
  }

  const source: MusicSource = createAudiusSource({ genre: () => genre, callbacks })

  /** The selection currently playing, so playConditions knows a start landed. */
  let currentSelection: Selection | null = null
  /** Guards rapid ticks from starting the same selection twice. */
  let startingId: string | null = null
  let started = false
  // The mood whose playlist is playing, and the one being switched to.
  // Genre plus conditions: switching genre must count as a change, or the
  // render tick would see the same key and never start the new music.
  const keyFor = (c: Conditions) => `${genre.id}|${signature(c)}`
  let playingKey: string | null = null
  let pendingKey: string | null = null

  /**
   * Resolves the conditions to a selection and starts it. playingKey is only
   * set on a confirmed start, so a failed search or switch is retried on a
   * later tick rather than being silently treated as done.
   */
  async function playConditions(c: Conditions): Promise<void> {
    const key = keyFor(c)
    debug('playConditions', { key, pendingKey, playingKey, started })
    if (pendingKey === key) return
    pendingKey = key
    setBusy(1)
    try {
      const sel = await source.resolve(c)
      debug('resolved selection', sel)
      if (!sel) {
        console.error(`no playable selection found for: ${key}`)
        // Reverting to "Press play to start" with no reason reads as a broken
        // button, so say what happened.
        playerUI.setNotice(
          source.id === 'audius'
            ? 'Could not reach the music service. Press play to try again.'
            : 'Could not find a playlist for right now. Press play to try again.',
        )
        return
      }
      playerUI.setNotice(null)
      await startSelection(sel)
      if (currentSelection?.id === sel.id) playingKey = key
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

  function render() {
    const result = match(base)
    applyPalette(backdrop, result.palette)
    controls.update(base)
    // Once playing, any change in conditions resolves a selection and switches.
    if (started && keyFor(base) !== playingKey) void playConditions(base)
    updateDiagnostics()
  }

  // Each switch claims a generation; an older in-flight fade sees it is no
  // longer current and drops out rather than fighting the newer one.
  let fadeGeneration = 0

  /**
   * How far through a fade the player is, 0..1. The volume actually sent to
   * the SDK is this times the listener's level, so a drag mid-crossfade takes
   * effect at once instead of being overwritten by the next ramp step.
   */
  let fadeFraction = 1

  /** Pushes the current fraction × level at whichever source is playing. */
  function pushVolume(): Promise<void> {
    return source.setVolume(fadeFraction * effective(volume))
  }

  function applyVolume(next: VolumeState): void {
    volume = next
    saveVolume(next)
    volumeUI?.update(next)
    // Before the player exists there is nothing to push to; the stored level is
    // picked up by the SDK constructor when it initialises.
    void pushVolume().catch(() => {})
  }

  async function startSelection(sel: Selection) {
    // Guards rapid ticks. It sits out here rather than inside the source
    // because what must not happen twice is the whole start *including* the
    // crossfade — a second pass would fade down and back up over the same
    // music for no reason.
    if (startingId === sel.id) return
    startingId = sel.id
    const generation = ++fadeGeneration
    const isCurrent = () => generation === fadeGeneration
    try {
      debug('startSelection: preflight', sel)

      // Ramps a fraction rather than an absolute volume: the listener's level
      // is a separate multiplier, so a drag during the fade is not clobbered.
      const ramp = (f: number) => {
        fadeFraction = f
        return source.setVolume(f * effective(volume))
      }

      // Fade out only if something is already audible — otherwise the first
      // press would sit through a silent ramp before anything happened.
      if (started) await fadeVolume(ramp, 1, 0, { isCurrent })
      if (!isCurrent()) return

      await ramp(0)
      await source.start(sel)
      debug('startSelection: play request accepted', sel)

      started = true
      currentSelection = sel

      if (isCurrent()) await fadeVolume(ramp, 0, 1, { isCurrent })
    } catch (e) {
      console.error('could not start playback', e)
      issue = `playback: ${e instanceof Error ? e.message : String(e)}`
      updateDiagnostics()
      // Never leave the player silent because a switch failed mid-fade.
      if (isCurrent()) {
        fadeFraction = 1
        await pushVolume().catch(() => {})
      }
    } finally {
      startingId = null
    }
  }

  const playerUI = buildPlayer(document.getElementById('player')!, {
    onToggle: () => {
      debug('toggle: clicked', { started })
      if (!started) {
        void source.activate() // gesture → unlock audio, then play
        void playConditions(base)
      } else source.togglePlay()
    },
    onNext: () => source.next(),
    onPrev: () => source.previous(),
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
    onAbout: () => showAbout(),
    onUseCity: (name) => useCity(name),
  })

  /** Resolves a typed city and adopts it as the location. Throws if not found. */
  async function useCity(name: string): Promise<void> {
    const found = await geocodeCity(name)
    coords = found
    locationSource = 'city'
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
      locationSource = 'geolocation'
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
      source: locationSource,
      coords,
      place,
      weatherCode: weather.current()?.code ?? null,
      weatherKind: weather.current()?.kind ?? null,
      temperatureC: weather.current()?.temperatureC ?? null,
    })
  }

  render()
  hideBoot()

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
