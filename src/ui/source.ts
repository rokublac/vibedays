import type { SourceId } from '../source/types'

/** "Free" rather than "Audius": the catalogue's name is not the point to a listener. */
export function sourceLabel(id: SourceId): string {
  return id === 'spotify' ? 'Spotify' : 'Free'
}

const OTHER: Record<SourceId, SourceId> = { spotify: 'audius', audius: 'spotify' }

export interface SourceCallbacks {
  onSelect(id: SourceId): void
}

export interface SourceUI {
  update(current: SourceId): void
  setBusy(busy: boolean): void
}

export function buildSourceToggle(root: HTMLElement, cb: SourceCallbacks): SourceUI {
  // A plain toggle rather than a menu: with two options a menu is a click of
  // ceremony for nothing.
  root.innerHTML = `
    <button id="source-chip" class="genre-chip source-chip" type="button">
      <span class="source-name"></span>
    </button>`

  const chip = root.querySelector<HTMLButtonElement>('#source-chip')!
  const name = root.querySelector<HTMLSpanElement>('.source-name')!

  let current: SourceId = 'spotify'
  chip.addEventListener('click', () => cb.onSelect(OTHER[current]))

  return {
    update(next: SourceId) {
      current = next
      name.textContent = sourceLabel(next)
      // The title describes the destination, not where you already are.
      chip.title =
        next === 'spotify'
          ? 'Switch to the free version — no account needed'
          : 'Switch to Spotify — needs a Premium account'
      chip.setAttribute('aria-label', chip.title)
    },

    setBusy(busy: boolean) {
      // Flipping again mid-switch would tear down a source that is still
      // starting, so the chip goes quiet until the swap lands.
      chip.disabled = busy
    },
  }
}
