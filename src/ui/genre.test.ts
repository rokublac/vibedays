import { describe, it, expect, vi } from 'vitest'
import { buildGenrePicker } from './genre'
import { GENRES, genreById } from '../config/genres'
import { dedupeWords } from '../search/query'
import { contradictions, nameContradicts } from '../search/rank'
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
  it('anchors are distinct, so switching actually changes the search', () => {
    const anchors = GENRES.map((g) => g.anchor)
    expect(new Set(anchors).size).toBe(anchors.length)
  })

  it('falls back to lofi for an unknown or missing id', () => {
    expect(genreById('nonsense').id).toBe('lofi')
    expect(genreById(null).id).toBe('lofi')
    expect(genreById(undefined).id).toBe('lofi')
  })

  it('never repeats a word inside an anchor, which the builder would collapse', () => {
    // "house deep house" would become "house deep" and lose the genre.
    for (const g of GENRES) expect(dedupeWords(g.anchor)).toBe(g.anchor)
  })

  it('never contains a word the ranker would reject its own results for', () => {
    // A "rain forest" anchor would be filtered out on a clear day: the app
    // would search for something it then refuses to play.
    const samples: Conditions[] = [
      { phase: 'midday', season: 'summer', weather: 'clear',
        cloud: 'clear', precip: 'none', temp: 'warm' },
      { phase: 'deep-night', season: 'winter', weather: 'rain',
        cloud: 'overcast', precip: 'steady', temp: 'freezing' },
    ]
    for (const c of samples) {
      const words = contradictions(c)
      for (const g of GENRES) {
        expect({ genre: g.id, contradicts: nameContradicts(g.anchor, words) })
          .toEqual({ genre: g.id, contradicts: false })
      }
    }
  })

  it('maps zen and spa music onto ambient, which Spotify actually tags', () => {
    const ambient = genreById('ambient')
    expect(ambient.anchor).toContain('ambient')
    expect(ambient.anchor).toContain('spa')
    expect(ambient.anchor).toContain('meditation')
  })
})
