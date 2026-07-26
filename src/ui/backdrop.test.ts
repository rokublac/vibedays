import { describe, it, expect, beforeEach } from 'vitest'
import { applyPalette } from './backdrop'
import type { Palette } from '../types'

const palette: Palette = {
  gradient: ['#111', '#222'],
  fg: '#eee',
  accent: '#abc',
  particles: 'rain',
  brandRainbow: ['#a00', '#0a0', '#00a'],
}

describe('applyPalette', () => {
  beforeEach(() => {
    document.documentElement.style.cssText = ''
  })

  it('sets the palette variables on :root so they reach the whole UI', () => {
    const el = document.createElement('div')
    applyPalette(el, palette)
    const vars = document.documentElement.style
    expect(vars.getPropertyValue('--grad-top')).toBe('#111')
    expect(vars.getPropertyValue('--grad-bottom')).toBe('#222')
    expect(vars.getPropertyValue('--fg')).toBe('#eee')
    expect(vars.getPropertyValue('--accent')).toBe('#abc')
  })

  it('closes the wordmark gradient loop by repeating the first stop', () => {
    applyPalette(document.createElement('div'), palette)
    expect(document.documentElement.style.getPropertyValue('--brand-rainbow'))
      .toBe('#a00, #0a0, #00a, #a00')
  })

  it('sets the particles data attribute on the backdrop element itself', () => {
    const el = document.createElement('div')
    applyPalette(el, palette)
    expect(el.dataset.particles).toBe('rain')
  })

  it('does not leave the variables on the backdrop element, where they would not cascade', () => {
    const el = document.createElement('div')
    applyPalette(el, palette)
    expect(el.style.getPropertyValue('--fg')).toBe('')
  })
})
