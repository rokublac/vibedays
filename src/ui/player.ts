import type { TrackInfo } from '../spotify/player'
import { fadeSwap, type SwapOptions } from './fade-swap'

export const IDLE_PROMPT = 'Press play to start'
export const BUSY_PROMPT = 'Finding a playlist…'
export const SWITCHING_STATUS = 'Finding a playlist…'

export interface PlayerControls {
  onToggle(): void
  onNext(): void
  onPrev(): void
  /** Swap to a different playlist for the same conditions. */
  onReroll(): void
}

export function buildPlayer(
  root: HTMLElement,
  cb: PlayerControls,
  swap: SwapOptions = {},
): {
  update(track: TrackInfo | null, paused: boolean): void
  setAlternatives(count: number): void
  setBusy(busy: boolean): void
} {
  // The transport can't nest inside the <a> (invalid, and the clicks would
  // fight), so the bar is a plain container holding the link and the buttons.
  // It stays visible with no track: that play button is how playback starts.
  root.innerHTML = `
    <div class="context-row" hidden>
      <span class="context-status" role="status" hidden>${SWITCHING_STATUS}</span>
      <a id="playing-from" class="context-line" target="_blank" rel="noopener noreferrer">
        <span class="context-label">Playing from</span>
        <span class="context-name"></span>
      </a>
      <button id="reroll" class="context-reroll" type="button"
              title="Try a different playlist for these conditions">Try another</button>
    </div>
    <div class="now-bar is-empty">
      <div class="now-bar-main">
        <span class="track-empty">${IDLE_PROMPT}</span>
        <a id="now-playing" class="track-link" target="_blank" rel="noopener noreferrer" hidden>
          <img class="track-art" alt="" width="80" height="80" />
          <span class="track-meta">
            <span class="track-name"></span>
            <span class="track-artist"></span>
          </span>
          <span class="track-open" aria-hidden="true">↗</span>
        </a>
        <div class="transport-row">
          <button id="pl-prev" class="transport" type="button" aria-label="Previous">⏮</button>
          <button id="pl-toggle" class="transport transport-main" type="button" aria-label="Play/Pause">▶</button>
          <button id="pl-next" class="transport" type="button" aria-label="Next">⏭</button>
        </div>
      </div>
      <!-- Filled by main only where the platform actually honours setVolume;
           left empty on iOS, where the row would move but the sound would not. -->
      <div id="volume-slot"></div>
    </div>`

  const bar = root.querySelector<HTMLDivElement>('.now-bar')!
  const contextRow = root.querySelector<HTMLDivElement>('.context-row')!
  const reroll = root.querySelector<HTMLButtonElement>('#reroll')!
  const context = root.querySelector<HTMLAnchorElement>('#playing-from')!
  const contextName = root.querySelector<HTMLSpanElement>('.context-name')!
  const status = root.querySelector<HTMLSpanElement>('.context-status')!
  const empty = root.querySelector<HTMLSpanElement>('.track-empty')!
  const toggle = root.querySelector<HTMLButtonElement>('#pl-toggle')!
  const link = root.querySelector<HTMLAnchorElement>('#now-playing')!
  const art = root.querySelector<HTMLImageElement>('.track-art')!
  const name = root.querySelector<HTMLSpanElement>('.track-name')!
  const artist = root.querySelector<HTMLSpanElement>('.track-artist')!

  root.querySelector('#pl-prev')!.addEventListener('click', () => cb.onPrev())
  toggle.addEventListener('click', () => cb.onToggle())
  root.querySelector('#pl-next')!.addEventListener('click', () => cb.onNext())
  root.querySelector('#reroll')!.addEventListener('click', () => cb.onReroll())

  // What the bar is currently showing. Track and context are tracked apart so
  // the SDK reporting a track before its context does not cause two fades.
  let shownTrack: string | null = null
  let shownContext: string | null = null
  let painted = false
  let busy = false
  /** An empty state withheld during a switch, replayed if it is still true after. */
  let held: { track: TrackInfo | null; paused: boolean } | null = null
  /** The last track actually rendered, so the context row can be restored. */
  let lastTrack: TrackInfo | null = null
  let alternatives = 0

  /**
   * Hidden entirely while a switch is running: a greyed-out button next to
   * "Finding a playlist…" is visual noise saying the same thing twice. It stays
   * disabled as well, so it cannot be activated in the frame before it hides.
   */
  function syncReroll() {
    const others = Math.max(0, alternatives - 1)
    reroll.hidden = busy
    reroll.disabled = busy || others === 0
    reroll.title = others
      ? `Switch to one of ${others} other playlist${others === 1 ? '' : 's'} for these conditions`
      : 'No other playlists found for these conditions'
  }

  const trackId = (t: TrackInfo | null) => (t ? `${t.url ?? t.name}|${t.artists}` : null)
  const contextId = (t: TrackInfo | null) => t?.context?.label ?? null

  function apply(track: TrackInfo | null) {
    // Assigned here, not in render(): the in-place context path skips render,
    // and a stale lastTrack made setBusy(false) restore the previous playlist.
    lastTrack = track
    const nextTrack = trackId(track)
    const nextContext = contextId(track)

    if (painted && nextTrack === shownTrack) {
      // Same track. A context that arrived late is written in place: fading the
      // whole card again for a subtitle change is what looked like a flicker.
      if (nextContext !== shownContext) {
        shownContext = nextContext
        renderContext(track)
      }
      return
    }

    const first = !painted
    painted = true
    shownTrack = nextTrack
    shownContext = nextContext

    if (first) render(track)
    else fadeSwap([link, contextRow], () => render(track), swap)
  }

  return {
    update(track: TrackInfo | null, paused: boolean) {
      // Never faded: the glyph is direct feedback on a click.
      toggle.textContent = paused ? '▶' : '⏸'

      // Switching playlists makes the SDK emit a momentary empty state between
      // the old track and the new one. Rendering it collapses the bar to its
      // empty prompt and straight back, which reads as a flash.
      if (busy && track === null) {
        held = { track, paused }
        return
      }
      held = null
      apply(track)
    },

    /**
     * Shown while a search or a play request is in flight. Pressing play
     * otherwise looks like nothing happened for about a second.
     */
    setBusy(next: boolean) {
      busy = next
      bar.classList.toggle('is-busy', next)
      empty.textContent = next ? BUSY_PROMPT : IDLE_PROMPT
      syncReroll()

      // With a track already on screen the empty prompt is hidden, so the
      // status takes the place of the playlist name: that is the thing being
      // replaced, and the breathing play button alone was too quiet to read.
      if (next && lastTrack) {
        contextRow.hidden = false
        status.hidden = false
        context.hidden = true
      } else {
        status.hidden = true
        context.hidden = false
        if (!next) renderContext(lastTrack)
      }

      // If it really did end with nothing playing, show that now.
      if (!next && held) {
        const pending = held
        held = null
        apply(pending.track)
      }
    },

    setAlternatives(count: number) {
      alternatives = count
      syncReroll()
    },
  }

  /** The "Playing from" row, separable so a late context can be written alone. */
  function renderContext(track: TrackInfo | null) {
    // The SDK does not always describe the context, so this line comes and goes.
    if (!track?.context) {
      contextRow.hidden = true
      return
    }
    contextRow.hidden = false
    contextName.textContent = track.context.label
    // Truncated names are common, so expose the full one on hover.
    contextName.title = track.context.label
    if (track.context.url) {
      context.href = track.context.url
      context.removeAttribute('aria-disabled')
    } else {
      context.removeAttribute('href')
      context.setAttribute('aria-disabled', 'true')
    }
  }

  function render(track: TrackInfo | null) {
    if (!track) {
      link.hidden = true
      empty.hidden = false
      contextRow.hidden = true
      bar.classList.add('is-empty')
      return
    }
    link.hidden = false
    empty.hidden = true
    bar.classList.remove('is-empty')

    renderContext(track)
    name.textContent = track.name
    artist.textContent = track.artists

    // Local files and podcasts can lack a permalink; keep the card, drop the link.
    if (track.url) {
      link.href = track.url
      link.removeAttribute('aria-disabled')
      link.setAttribute(
        'aria-label',
        track.artists
          ? `Open ${track.name} by ${track.artists} in Spotify`
          : `Open ${track.name} in Spotify`,
      )
    } else {
      link.removeAttribute('href')
      link.setAttribute('aria-disabled', 'true')
      link.removeAttribute('aria-label')
    }

    if (track.artworkUrl) {
      art.src = track.artworkUrl
      art.hidden = false
    } else {
      art.removeAttribute('src')
      art.hidden = true
    }
  }
}
