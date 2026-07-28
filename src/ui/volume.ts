import type { VolumeState } from '../config/volume'

/**
 * Four glyphs rather than two: the level is readable at a glance from the
 * icon alone, which is what the row looks like on a narrow screen where the
 * percentage is the first thing to lose attention.
 */
export function volumeIcon(level: number, muted: boolean): string {
  if (muted || level <= 0) return '🔇'
  if (level < 0.34) return '🔈'
  if (level < 0.67) return '🔉'
  return '🔊'
}

export function formatVolume(level: number, muted: boolean): string {
  // "0%" and "Muted" are different states to a listener; only one of them is
  // reversible by pressing the same button again.
  if (muted) return 'Muted'
  return `${Math.round(level * 100)}%`
}

export interface VolumeCallbacks {
  /** A 0..1 level from the slider. Fired live during a drag. */
  onChange(level: number): void
  onToggleMute(): void
}

export function buildVolume(
  root: HTMLElement,
  cb: VolumeCallbacks,
): { update(s: VolumeState): void } {
  // A native range gives drag, click-anywhere-on-the-track, arrow keys,
  // Home/End, touch and screen-reader support for free; only the paint is ours.
  root.innerHTML = `
    <div class="volume-row">
      <button id="volume-mute" class="volume-mute" type="button" aria-label="Mute">🔊</button>
      <input id="volume-range" class="volume-range" type="range"
             min="0" max="100" step="1" value="60" aria-label="Volume" />
      <span class="volume-value">60%</span>
    </div>`

  const mute = root.querySelector<HTMLButtonElement>('#volume-mute')!
  const range = root.querySelector<HTMLInputElement>('#volume-range')!
  const value = root.querySelector<HTMLSpanElement>('.volume-value')!

  // 'input', not 'change': the volume should follow the thumb during the drag
  // rather than jumping once on release.
  range.addEventListener('input', () => cb.onChange(Number(range.value) / 100))
  mute.addEventListener('click', () => cb.onToggleMute())

  return {
    update(s: VolumeState) {
      // The thumb stays at the remembered level while muted, so unmuting is
      // visibly a return to where it was rather than a jump from zero.
      const percent = Math.round(s.level * 100)
      range.value = String(percent)
      // Fills the track up to the thumb; see the CSS for how it is used.
      range.style.setProperty('--fill', `${percent}%`)

      const text = formatVolume(s.level, s.muted)
      range.setAttribute('aria-valuetext', text)
      value.textContent = text

      mute.textContent = volumeIcon(s.level, s.muted)
      mute.setAttribute('aria-pressed', String(s.muted))
      mute.setAttribute('aria-label', s.muted ? 'Unmute' : 'Mute')
    },
  }
}
