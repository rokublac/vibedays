import { describe, it, expect, vi } from 'vitest'
import { buildVolume, volumeIcon, formatVolume } from './volume'

const cb = () => ({ onChange: vi.fn(), onToggleMute: vi.fn() })

function mount() {
  const root = document.createElement('div')
  const callbacks = cb()
  const ui = buildVolume(root, callbacks)
  return { root, callbacks, ui }
}

const slider = (root: HTMLElement) => root.querySelector<HTMLInputElement>('#volume-range')!
const muteBtn = (root: HTMLElement) => root.querySelector<HTMLButtonElement>('#volume-mute')!

describe('volumeIcon', () => {
  it('shows the level in the glyph', () => {
    expect(volumeIcon(0.1, false)).toBe('🔈')
    expect(volumeIcon(0.5, false)).toBe('🔉')
    expect(volumeIcon(0.9, false)).toBe('🔊')
  })

  it('shows silence when muted or at zero, so the icon never lies', () => {
    expect(volumeIcon(0.9, true)).toBe('🔇')
    expect(volumeIcon(0, false)).toBe('🔇')
  })
})

describe('formatVolume', () => {
  it('rounds to whole percent', () => {
    expect(formatVolume(0.615, false)).toBe('62%')
    expect(formatVolume(1, false)).toBe('100%')
  })

  it('says muted rather than 0%', () => {
    expect(formatVolume(0.6, true)).toBe('Muted')
  })
})

describe('buildVolume', () => {
  it('reports a drag as a 0..1 level', () => {
    const { root, callbacks } = mount()
    const range = slider(root)
    range.value = '25'
    range.dispatchEvent(new Event('input'))
    expect(callbacks.onChange).toHaveBeenCalledWith(0.25)
  })

  it('reports every step of a drag, so the sound tracks the thumb', () => {
    const { root, callbacks } = mount()
    const range = slider(root)
    for (const v of ['80', '60', '40']) {
      range.value = v
      range.dispatchEvent(new Event('input'))
    }
    expect(callbacks.onChange).toHaveBeenCalledTimes(3)
    expect(callbacks.onChange).toHaveBeenLastCalledWith(0.4)
  })

  it('wires the mute button', () => {
    const { root, callbacks } = mount()
    muteBtn(root).click()
    expect(callbacks.onToggleMute).toHaveBeenCalledTimes(1)
  })

  it('renders a state into the slider, icon and readout', () => {
    const { root, ui } = mount()
    ui.update({ level: 0.3, muted: false })
    expect(slider(root).value).toBe('30')
    expect(muteBtn(root).textContent).toBe('🔈')
    expect(root.querySelector('.volume-value')!.textContent).toBe('30%')
  })

  it('keeps the slider at the remembered level while muted', () => {
    // The level is not lost by muting, so unmuting can return to it.
    const { root, ui } = mount()
    ui.update({ level: 0.8, muted: true })
    expect(slider(root).value).toBe('80')
    expect(muteBtn(root).textContent).toBe('🔇')
    expect(root.querySelector('.volume-value')!.textContent).toBe('Muted')
  })

  it('announces muting to assistive tech rather than reading out 80 percent', () => {
    const { root, ui } = mount()
    ui.update({ level: 0.8, muted: true })
    expect(slider(root).getAttribute('aria-valuetext')).toBe('Muted')
    expect(muteBtn(root).getAttribute('aria-pressed')).toBe('true')
    expect(muteBtn(root).getAttribute('aria-label')).toBe('Unmute')
  })

  it('offers to mute when it is not muted', () => {
    const { root, ui } = mount()
    ui.update({ level: 0.8, muted: false })
    expect(muteBtn(root).getAttribute('aria-pressed')).toBe('false')
    expect(muteBtn(root).getAttribute('aria-label')).toBe('Mute')
  })

  it('does not call back while rendering', () => {
    // update() is the caller telling the UI what is true; echoing it back
    // would loop through main's applyVolume and re-enter here.
    const { ui, callbacks } = mount()
    ui.update({ level: 0.2, muted: true })
    expect(callbacks.onChange).not.toHaveBeenCalled()
    expect(callbacks.onToggleMute).not.toHaveBeenCalled()
  })
})
