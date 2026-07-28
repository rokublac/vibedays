import { describe, it, expect } from 'vitest'
import { canSetVolume } from './audio-capability'

/** Stands in for a browser that honours the assignment. */
function honouring(): HTMLAudioElement {
  return { volume: 1 } as HTMLAudioElement
}

/** Stands in for iOS, where volume is read-only and stays at 1. */
function clamping(): HTMLAudioElement {
  const el = {}
  Object.defineProperty(el, 'volume', { get: () => 1, set: () => {} })
  return el as HTMLAudioElement
}

describe('canSetVolume', () => {
  it('is true when the assignment sticks', () => {
    expect(canSetVolume(honouring)).toBe(true)
  })

  it('is false when the platform clamps the volume back', () => {
    expect(canSetVolume(clamping)).toBe(false)
  })

  it('is false rather than throwing when an element cannot be made', () => {
    expect(canSetVolume(() => { throw new Error('no audio') })).toBe(false)
  })
})
