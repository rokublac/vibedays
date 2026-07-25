/**
 * Volume ramping for playlist switches.
 *
 * Note this is a fade-out/fade-in, not a crossfade: the Web Playback SDK exposes
 * a single output stream, so the outgoing and incoming tracks cannot overlap.
 */

/** Playback volume when not mid-fade. Matches the SDK's initial volume. */
export const VOLUME = 0.6

export const FADE_MS = 700
export const STEP_MS = 40

/**
 * Smoothstep ramp from `from` to `to`. Eased rather than linear so the change
 * is not audible as a sudden onset at either end. Always lands exactly on `to`.
 */
export function fadeCurve(from: number, to: number, steps: number): number[] {
  const count = Math.max(1, Math.floor(steps))
  const out: number[] = []
  for (let i = 1; i <= count; i++) {
    const t = i / count
    const eased = t * t * (3 - 2 * t)
    out.push(from + (to - from) * eased)
  }
  out[out.length - 1] = to
  return out
}

export interface FadeOptions {
  durationMs?: number
  stepMs?: number
  /** Injectable for tests; defaults to a real timer. */
  sleep?: (ms: number) => Promise<void>
  /** Return false to abandon the ramp — used to drop a fade superseded by a newer one. */
  isCurrent?: () => boolean
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * Applies the ramp step by step. Resolves true if it ran to completion, false
 * if `isCurrent` went false partway — the caller then leaves the volume alone,
 * because whoever superseded this fade now owns it.
 */
export async function fadeVolume(
  apply: (v: number) => unknown,
  from: number,
  to: number,
  opts: FadeOptions = {},
): Promise<boolean> {
  const { durationMs = FADE_MS, stepMs = STEP_MS, sleep = realSleep, isCurrent } = opts
  const steps = Math.max(1, Math.round(durationMs / stepMs))

  for (const v of fadeCurve(from, to, steps)) {
    if (isCurrent && !isCurrent()) return false
    await apply(v)
    await sleep(stepMs)
  }
  return true
}
