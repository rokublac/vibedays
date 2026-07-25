/** Cross-fades element content: fade out, swap, fade back in. */

/** Must match the opacity transition on .is-fading in style.css. */
export const SWAP_MS = 240

export interface SwapOptions {
  durationMs?: number
  /** Injectable for tests; defaults to a real timer. */
  schedule?: (fn: () => void, ms: number) => void
}

export function fadeSwap(
  target: HTMLElement | HTMLElement[],
  apply: () => void,
  opts: SwapOptions = {},
): void {
  const { durationMs = SWAP_MS, schedule = (fn, ms) => void setTimeout(fn, ms) } = opts
  const els = Array.isArray(target) ? target : [target]

  els.forEach((el) => el.classList.add('is-fading'))
  schedule(() => {
    apply()
    els.forEach((el) => el.classList.remove('is-fading'))
  }, durationMs)
}
