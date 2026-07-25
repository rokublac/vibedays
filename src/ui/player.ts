import type { TrackInfo } from '../spotify/player'
import { fadeSwap, type SwapOptions } from './fade-swap'

export interface PlayerControls {
  onToggle(): void
  onNext(): void
  onPrev(): void
}

export function buildPlayer(
  root: HTMLElement,
  cb: PlayerControls,
  swap: SwapOptions = {},
): { update(track: TrackInfo | null, paused: boolean): void } {
  // The transport can't nest inside the <a> (invalid, and the clicks would
  // fight), so the bar is a plain container holding the link and the buttons.
  // It stays visible with no track: that play button is how playback starts.
  root.innerHTML = `
    <a id="playing-from" class="context-line" target="_blank" rel="noopener noreferrer" hidden>
      <span class="context-label">Playing from</span>
      <span class="context-name"></span>
    </a>
    <div class="now-bar is-empty">
      <span class="track-empty">Press play to start</span>
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
    </div>`

  const bar = root.querySelector<HTMLDivElement>('.now-bar')!
  const context = root.querySelector<HTMLAnchorElement>('#playing-from')!
  const contextName = root.querySelector<HTMLSpanElement>('.context-name')!
  const empty = root.querySelector<HTMLSpanElement>('.track-empty')!
  const toggle = root.querySelector<HTMLButtonElement>('#pl-toggle')!
  const link = root.querySelector<HTMLAnchorElement>('#now-playing')!
  const art = root.querySelector<HTMLImageElement>('.track-art')!
  const name = root.querySelector<HTMLSpanElement>('.track-name')!
  const artist = root.querySelector<HTMLSpanElement>('.track-artist')!

  root.querySelector('#pl-prev')!.addEventListener('click', () => cb.onPrev())
  toggle.addEventListener('click', () => cb.onToggle())
  root.querySelector('#pl-next')!.addEventListener('click', () => cb.onNext())

  // Identity of what the bar is showing, so a pause/resume does not re-fade it.
  let shown: string | null = null
  const identity = (t: TrackInfo | null) =>
    t && `${t.url ?? t.name}|${t.artists}|${t.context?.label ?? ''}`

  return {
    update(track: TrackInfo | null, paused: boolean) {
      // Never faded: the glyph is direct feedback on a click.
      toggle.textContent = paused ? '▶' : '⏸'

      const next = identity(track)
      if (next === shown) return
      const first = shown === null
      shown = next

      if (!first) {
        fadeSwap([link, context], () => render(track), swap)
        return
      }
      render(track)
    },
  }

  function render(track: TrackInfo | null) {
    if (!track) {
      link.hidden = true
      empty.hidden = false
      context.hidden = true
      bar.classList.add('is-empty')
      return
    }
    link.hidden = false
    empty.hidden = true
    bar.classList.remove('is-empty')

    // The SDK does not always describe the context, so this line comes and goes.
    if (track.context) {
      context.hidden = false
      contextName.textContent = track.context.label
      if (track.context.url) {
        context.href = track.context.url
        context.removeAttribute('aria-disabled')
      } else {
        context.removeAttribute('href')
        context.setAttribute('aria-disabled', 'true')
      }
    } else {
      context.hidden = true
    }
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
