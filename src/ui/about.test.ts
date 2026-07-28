import { describe, it, expect, vi } from 'vitest'
import {
  buildAbout, ABOUT_PARAGRAPHS, ABOUT_TITLE, AUDIUS_URL, AUTHOR, AUTHOR_URL,
} from './about'

const mount = () => {
  const root = document.createElement('div')
  const onClose = vi.fn()
  buildAbout(root, { onClose })
  return { root, onClose }
}

describe('buildAbout', () => {
  it('renders as a labelled dialog', () => {
    const card = mount().root.querySelector('.modal-card')!
    expect(card.getAttribute('role')).toBe('dialog')
    expect(card.getAttribute('aria-modal')).toBe('true')
    expect(card.getAttribute('aria-labelledby')).toBe('about-title')
    expect(mount().root.querySelector('#about-title')!.textContent).toBe(ABOUT_TITLE)
  })

  it('says what the app does, where the location goes and what it needs', () => {
    const text = mount().root.textContent!
    expect(text).toContain('sun')
    expect(text).toContain('weather')
    expect(text).toContain('location')
    expect(text).toContain('Audius')
  })

  it('is plain and free of em dashes', () => {
    for (const p of ABOUT_PARAGRAPHS) expect(p).not.toContain('—')
  })

  it('stays short enough to read at a glance', () => {
    // Rendered text, not the raw fragments: those carry the link markup.
    const prose = [...mount().root.querySelectorAll('.modal-card p')]
      .map((p) => p.textContent)
      .join(' ')
    expect(prose.length).toBeLessThan(620)
    expect(ABOUT_PARAGRAPHS).toHaveLength(4)
  })

  it('is honest that the match is a guess rather than exact', () => {
    const text = mount().root.textContent!.toLowerCase()
    expect(text).toContain('best guess')
    expect(text).toContain('not always be spot on')
  })

  it('credits the author and links to their GitHub', () => {
    const credit = mount().root.querySelector('.about-credit')!
    expect(credit.textContent).toContain('Created by')
    const link = credit.querySelector<HTMLAnchorElement>('a')!
    expect(link.textContent).toBe(AUTHOR)
    expect(link.getAttribute('href')).toBe(AUTHOR_URL)
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('keeps the credit out of the prose count', () => {
    const paragraphs = mount().root.querySelectorAll('.modal-card p:not(.about-credit)')
    expect(paragraphs).toHaveLength(ABOUT_PARAGRAPHS.length)
  })

  it('links the catalogue mention to Audius', () => {
    const link = mount().root.querySelector<HTMLAnchorElement>('.text-link')!
    expect(link.getAttribute('href')).toBe(AUDIUS_URL)
    expect(link.textContent).toBe('Audius')
  })

  it('opens the plans link in a new tab without leaking the referrer', () => {
    const link = mount().root.querySelector<HTMLAnchorElement>('.text-link')!
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('closes from the close button', () => {
    const { root, onClose } = mount()
    root.querySelector<HTMLButtonElement>('#about-close')!.click()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders each paragraph separately rather than one block', () => {
    expect(mount().root.querySelectorAll('.modal-card p:not(.about-credit)'))
      .toHaveLength(ABOUT_PARAGRAPHS.length)
  })
})
