import { describe, it, expect, vi } from 'vitest'
import { buildAccount } from './account'
import type { SpotifyProfile } from '../spotify/profile-api'

const cb = () => ({ onSignIn: vi.fn(), onSignOut: vi.fn() })
const PROFILE: SpotifyProfile = {
  id: 'rokublac', displayName: 'Roku', avatarUrl: 'a.jpg', product: 'premium',
}

const mount = (callbacks = cb()) => {
  const root = document.createElement('div')
  document.body.appendChild(root)
  return { root, ui: buildAccount(root, callbacks), callbacks }
}

describe('signed out', () => {
  it('offers sign in and hides the account chip', () => {
    const { root, ui } = mount()
    ui.update(null)
    expect(root.querySelector<HTMLButtonElement>('#sign-in')!.hidden).toBe(false)
    expect(root.querySelector<HTMLDivElement>('.account')!.hidden).toBe(true)
  })
  it('calls back when sign in is pressed', () => {
    const { root, ui, callbacks } = mount()
    ui.update(null)
    root.querySelector<HTMLButtonElement>('#sign-in')!.click()
    expect(callbacks.onSignIn).toHaveBeenCalledTimes(1)
  })
})

describe('signed in', () => {
  it('shows the name and avatar, and hides the sign-in button', () => {
    const { root, ui } = mount()
    ui.update(PROFILE)
    expect(root.querySelector<HTMLButtonElement>('#sign-in')!.hidden).toBe(true)
    expect(root.querySelector('.account-name')!.textContent).toBe('Roku')
    const img = root.querySelector<HTMLImageElement>('.account-avatar-img')!
    expect(img.hidden).toBe(false)
    expect(img.getAttribute('src')).toBe('a.jpg')
  })

  it('falls back to initials when the account has no picture', () => {
    const { root, ui } = mount()
    ui.update({ ...PROFILE, displayName: 'Brad Beal', avatarUrl: null })
    expect(root.querySelector<HTMLImageElement>('.account-avatar-img')!.hidden).toBe(true)
    expect(root.querySelector('.account-initials')!.textContent).toBe('BB')
  })

  it('swaps back to the picture when a later profile has one', () => {
    const { root, ui } = mount()
    ui.update({ ...PROFILE, avatarUrl: null })
    ui.update(PROFILE)
    const img = root.querySelector<HTMLImageElement>('.account-avatar-img')!
    expect(img.hidden).toBe(false)
    expect(root.querySelector('.account-initials')!.textContent).toBe('')
  })

  it('opens and closes the menu on click, tracking aria-expanded', () => {
    const { root, ui } = mount()
    ui.update(PROFILE)
    const chip = root.querySelector<HTMLButtonElement>('#account-chip')!
    const menu = root.querySelector<HTMLDivElement>('#account-menu')!

    expect(menu.hidden).toBe(true)
    expect(chip.getAttribute('aria-expanded')).toBe('false')
    chip.click()
    expect(menu.hidden).toBe(false)
    expect(chip.getAttribute('aria-expanded')).toBe('true')
    chip.click()
    expect(menu.hidden).toBe(true)
  })

  it('signs out from the menu', () => {
    const { root, ui, callbacks } = mount()
    ui.update(PROFILE)
    root.querySelector<HTMLButtonElement>('#account-chip')!.click()
    root.querySelector<HTMLButtonElement>('#sign-out')!.click()
    expect(callbacks.onSignOut).toHaveBeenCalledTimes(1)
    expect(root.querySelector<HTMLDivElement>('#account-menu')!.hidden).toBe(true)
  })

  it('closes on a click outside', () => {
    const { root, ui } = mount()
    ui.update(PROFILE)
    root.querySelector<HTMLButtonElement>('#account-chip')!.click()
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(root.querySelector<HTMLDivElement>('#account-menu')!.hidden).toBe(true)
  })

  it('closes on Escape', () => {
    const { root, ui } = mount()
    ui.update(PROFILE)
    root.querySelector<HTMLButtonElement>('#account-chip')!.click()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(root.querySelector<HTMLDivElement>('#account-menu')!.hidden).toBe(true)
  })

  it('closes the menu when the user signs out and the chip disappears', () => {
    const { root, ui } = mount()
    ui.update(PROFILE)
    root.querySelector<HTMLButtonElement>('#account-chip')!.click()
    ui.update(null)
    expect(root.querySelector<HTMLDivElement>('#account-menu')!.hidden).toBe(true)
  })
})
