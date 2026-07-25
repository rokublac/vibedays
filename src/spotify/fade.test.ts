import { describe, it, expect, vi } from 'vitest'
import { fadeCurve, fadeVolume, VOLUME } from './fade'

const noSleep = () => Promise.resolve()

describe('fadeCurve', () => {
  it('lands exactly on the target', () => {
    expect(fadeCurve(0.6, 0, 10).at(-1)).toBe(0)
    expect(fadeCurve(0, 0.6, 10).at(-1)).toBe(0.6)
  })

  it('produces the requested number of steps', () => {
    expect(fadeCurve(0, 1, 17)).toHaveLength(17)
  })

  it('descends monotonically when fading out', () => {
    const curve = fadeCurve(0.6, 0, 20)
    for (let i = 1; i < curve.length; i++) expect(curve[i]).toBeLessThanOrEqual(curve[i - 1])
  })

  it('ascends monotonically when fading in', () => {
    const curve = fadeCurve(0, 0.6, 20)
    for (let i = 1; i < curve.length; i++) expect(curve[i]).toBeGreaterThanOrEqual(curve[i - 1])
  })

  it('stays within the endpoints', () => {
    for (const v of fadeCurve(0, 0.6, 20)) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(0.6)
    }
  })

  it('eases rather than running linear', () => {
    // Smoothstep sits below the linear midpoint early on.
    const curve = fadeCurve(0, 1, 10)
    expect(curve[1]).toBeLessThan(0.2)
  })

  it('survives a degenerate step count', () => {
    expect(fadeCurve(0.6, 0, 0)).toEqual([0])
    expect(fadeCurve(0.6, 0, -5)).toEqual([0])
  })
})

describe('fadeVolume', () => {
  it('applies every step and ends on the target', async () => {
    const applied: number[] = []
    const done = await fadeVolume((v) => applied.push(v), VOLUME, 0, {
      durationMs: 200,
      stepMs: 50,
      sleep: noSleep,
    })
    expect(done).toBe(true)
    expect(applied).toHaveLength(4)
    expect(applied.at(-1)).toBe(0)
  })

  it('waits between steps', async () => {
    const sleep = vi.fn(noSleep)
    await fadeVolume(() => {}, 0, VOLUME, { durationMs: 120, stepMs: 40, sleep })
    expect(sleep).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledWith(40)
  })

  it('abandons the ramp when superseded, leaving the volume to the new owner', async () => {
    const applied: number[] = []
    let live = true
    const done = await fadeVolume(
      (v) => {
        applied.push(v)
        if (applied.length === 2) live = false
      },
      VOLUME,
      0,
      { durationMs: 400, stepMs: 40, sleep: noSleep, isCurrent: () => live },
    )
    expect(done).toBe(false)
    expect(applied).toHaveLength(2)
    expect(applied.at(-1)).not.toBe(0)
  })

  it('does not apply anything if it is already stale', async () => {
    const apply = vi.fn()
    const done = await fadeVolume(apply, VOLUME, 0, { sleep: noSleep, isCurrent: () => false })
    expect(done).toBe(false)
    expect(apply).not.toHaveBeenCalled()
  })

  it('awaits an async apply', async () => {
    const order: string[] = []
    await fadeVolume(
      async (v) => {
        order.push(`apply:${v}`)
        await Promise.resolve()
      },
      0,
      1,
      { durationMs: 80, stepMs: 40, sleep: noSleep },
    )
    expect(order).toEqual(['apply:0.5', 'apply:1'])
  })
})
