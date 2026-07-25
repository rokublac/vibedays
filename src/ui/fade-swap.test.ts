import { describe, it, expect, vi } from 'vitest'
import { fadeSwap, SWAP_MS } from './fade-swap'

const el = () => document.createElement('div')
const immediate = (fn: () => void) => fn()

describe('fadeSwap', () => {
  it('fades out before applying, and back in after', () => {
    const target = el()
    const seen: boolean[] = []
    fadeSwap(target, () => seen.push(target.classList.contains('is-fading')), {
      schedule: immediate,
    })
    expect(seen).toEqual([true]) // still faded at the moment of the swap
    expect(target.classList.contains('is-fading')).toBe(false)
  })

  it('does not apply until the delay elapses', () => {
    const target = el()
    const apply = vi.fn()
    let run: (() => void) | null = null
    fadeSwap(target, apply, { schedule: (fn) => { run = fn } })

    expect(apply).not.toHaveBeenCalled()
    expect(target.classList.contains('is-fading')).toBe(true)

    run!()
    expect(apply).toHaveBeenCalledTimes(1)
    expect(target.classList.contains('is-fading')).toBe(false)
  })

  it('defaults to the duration the stylesheet transitions on', () => {
    const schedule = vi.fn()
    fadeSwap(el(), () => {}, { schedule })
    expect(schedule).toHaveBeenCalledWith(expect.any(Function), SWAP_MS)
  })

  it('fades several elements together', () => {
    const a = el()
    const b = el()
    let run: (() => void) | null = null
    fadeSwap([a, b], () => {}, { schedule: (fn) => { run = fn } })

    expect(a.classList.contains('is-fading')).toBe(true)
    expect(b.classList.contains('is-fading')).toBe(true)

    run!()
    expect(a.classList.contains('is-fading')).toBe(false)
    expect(b.classList.contains('is-fading')).toBe(false)
  })
})
