import { describe, it, expect, vi } from 'vitest'
import { buildSourceToggle, sourceLabel } from './source'

function mount() {
  const root = document.createElement('div')
  const onSelect = vi.fn()
  const ui = buildSourceToggle(root, { onSelect })
  return { root, onSelect, ui }
}

const chip = (root: HTMLElement) => root.querySelector<HTMLButtonElement>('#source-chip')!

describe('sourceLabel', () => {
  it('names both sources', () => {
    expect(sourceLabel('spotify')).toBe('Spotify')
    expect(sourceLabel('audius')).toBe('Free')
  })
})

describe('buildSourceToggle', () => {
  it('renders the active source', () => {
    const { root, ui } = mount()
    ui.update('spotify')
    expect(chip(root).textContent).toContain('Spotify')
    ui.update('audius')
    expect(chip(root).textContent).toContain('Free')
  })

  it('offers the other source when clicked', () => {
    const { root, ui, onSelect } = mount()
    ui.update('spotify')
    chip(root).click()
    expect(onSelect).toHaveBeenCalledWith('audius')
  })

  it('toggles back the other way', () => {
    const { root, ui, onSelect } = mount()
    ui.update('audius')
    chip(root).click()
    expect(onSelect).toHaveBeenCalledWith('spotify')
  })

  it('says what clicking will do, not just where you are', () => {
    const { root, ui } = mount()
    ui.update('spotify')
    expect(chip(root).getAttribute('title')).toContain('free')
  })

  it('disables while busy, so a switch cannot be started twice', () => {
    const { root, ui } = mount()
    ui.update('spotify')
    ui.setBusy(true)
    expect(chip(root).disabled).toBe(true)
    ui.setBusy(false)
    expect(chip(root).disabled).toBe(false)
  })

  it('does not call back while rendering', () => {
    const { ui, onSelect } = mount()
    ui.update('audius')
    ui.setBusy(true)
    expect(onSelect).not.toHaveBeenCalled()
  })
})
