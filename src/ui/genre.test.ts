import { describe, it, expect, vi } from 'vitest'
import { buildGenrePicker } from './genre'
import { GENRES, genreById } from '../config/genres'
import { audiusQuery } from '../audius/mood-map'
import type { Conditions } from '../types'

const mount = () => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  const onSelect = vi.fn()
  const ui = buildGenrePicker(root, { onSelect })
  ui.update(genreById('lofi'))
  return { root, ui, onSelect }
}

describe('buildGenrePicker', () => {
  it('shows the current genre on the chip', () => {
    const { root, ui } = mount()
    expect(root.querySelector('.genre-name')!.textContent).toBe('Lofi')
    ui.update(genreById('jazz'))
    expect(root.querySelector('.genre-name')!.textContent).toBe('Jazz')
  })

  it('lists every genre', () => {
    const { root } = mount()
    const labels = [...root.querySelectorAll('.genre-item')].map((b) => b.textContent)
    expect(labels).toEqual(GENRES.map((g) => g.label))
  })

  it('marks the current one for assistive tech, not just visually', () => {
    const { root, ui } = mount()
    ui.update(genreById('ambient'))
    const checked = [...root.querySelectorAll('.genre-item')]
      .filter((b) => b.getAttribute('aria-checked') === 'true')
      .map((b) => b.textContent)
    expect(checked).toEqual(['Ambient'])
  })

  it('reports the picked genre and closes the menu', () => {
    const { root, onSelect } = mount()
    root.querySelector<HTMLButtonElement>('#genre-chip')!.click()
    root.querySelector<HTMLButtonElement>('[data-genre="synthwave"]')!.click()
    expect(onSelect).toHaveBeenCalledWith(genreById('synthwave'))
    expect(root.querySelector<HTMLDivElement>('#genre-menu')!.hidden).toBe(true)
  })

  it('tracks open state for assistive tech', () => {
    const { root } = mount()
    const chip = root.querySelector<HTMLButtonElement>('#genre-chip')!
    expect(chip.getAttribute('aria-expanded')).toBe('false')
    chip.click()
    expect(chip.getAttribute('aria-expanded')).toBe('true')
  })

  it('closes on Escape and on a click outside', () => {
    const { root } = mount()
    const chip = root.querySelector<HTMLButtonElement>('#genre-chip')!
    const menu = root.querySelector<HTMLDivElement>('#genre-menu')!

    chip.click()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(menu.hidden).toBe(true)

    chip.click()
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(menu.hidden).toBe(true)
  })

  it('locks while a search is running, so a switch cannot be stranded', () => {
    const { root, ui } = mount()
    const chip = root.querySelector<HTMLButtonElement>('#genre-chip')!
    chip.click()

    ui.setBusy(true)
    expect(chip.disabled).toBe(true)
    expect(root.querySelector<HTMLDivElement>('#genre-menu')!.hidden).toBe(true)

    ui.setBusy(false)
    expect(chip.disabled).toBe(false)
  })
})

describe('genre definitions', () => {
  it('falls back to lofi for an unknown or missing id', () => {
    expect(genreById('nonsense').id).toBe('lofi')
    expect(genreById(null).id).toBe('lofi')
    expect(genreById(undefined).id).toBe('lofi')
  })

  it('every genre resolves to something searchable', () => {
    // A genre the query builder does not know would silently fall back to
    // lofi, so the picker would show a choice that does nothing.
    const c: Conditions = {
      located: true, phase: 'midday', season: 'summer', weather: 'clear',
      cloud: 'clear', precip: 'none', temp: 'warm',
    }
    for (const g of GENRES) {
      const q = audiusQuery(c, g)
      expect(q.genre ?? q.query).toBeTruthy()
    }
  })

  it('gives every genre a distinct label for the picker', () => {
    const labels = GENRES.map((g) => g.label)
    expect(new Set(labels).size).toBe(labels.length)
  })
})
