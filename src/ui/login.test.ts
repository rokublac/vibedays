import { describe, it, expect, vi } from 'vitest'
import { buildLogin, buildPremiumNotice, escapeHtml } from './login'

const mount = (summary = 'clear · cold · winter → Deep night') => {
  const root = document.createElement('div')
  const onLogin = vi.fn()
  buildLogin(root, { summary, onLogin })
  return { root, onLogin }
}

describe('buildLogin', () => {
  it('explains what the app does', () => {
    const text = mount().root.textContent!.toLowerCase()
    // Meaning, not exact phrasing, so reworded copy doesn't fail the suite.
    expect(text).toMatch(/weather/)
    expect(text).toMatch(/mood|time of day|season/)
    expect(text).toMatch(/music|lofi/)
  })

  it('no longer claims you pick a playlist per mood', () => {
    // The picker is gone; this copy outlived it once already.
    const text = mount().root.textContent!.toLowerCase()
    expect(text).not.toContain('pick which playlist')
    expect(text).not.toContain('for each mood')
  })

  it('states the Premium requirement', () => {
    expect(mount().root.textContent).toContain('Premium')
  })

  it('hyperlinks the words "Spotify Premium" itself', () => {
    const link = mount().root.querySelector<HTMLAnchorElement>('.text-link')!
    expect(link.getAttribute('href')).toBe('https://www.spotify.com/premium/')
    // Contains rather than equals, so wording around the link can change.
    expect(link.textContent).toContain('Spotify Premium')
  })

  it('opens the plans link in a new tab without leaking the referrer', () => {
    const link = mount().root.querySelector<HTMLAnchorElement>('.text-link')!
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('keeps the copy free of em dashes', () => {
    expect(mount().root.textContent).not.toContain('—')
  })

  it('shows the live condition summary, so it visibly works signed out', () => {
    const { root } = mount('overcast · drizzle · mild · summer → Golden hour')
    expect(root.querySelector('.detected')!.textContent)
      .toContain('overcast · drizzle · mild · summer → Golden hour')
  })

  it('wires the login button', () => {
    const { root, onLogin } = mount()
    root.querySelector<HTMLButtonElement>('#login-btn')!.click()
    expect(onLogin).toHaveBeenCalledTimes(1)
  })

  it('escapes the summary rather than injecting it as markup', () => {
    const { root } = mount('<img src=x onerror=alert(1)>')
    expect(root.querySelector('img')).toBeNull()
    expect(root.querySelector('.detected')!.textContent).toContain('<img')
  })
})

describe('escapeHtml', () => {
  it('escapes the characters that break out of markup', () => {
    expect(escapeHtml(`<>&"'`)).toBe('&lt;&gt;&amp;&quot;&#39;')
  })
})

describe('buildPremiumNotice', () => {
  const notice = (displayName: string | null = 'Roku') => {
    const root = document.createElement('div')
    const onSignOut = vi.fn()
    buildPremiumNotice(root, { displayName, onSignOut })
    return { root, onSignOut }
  }

  it('names the account that cannot stream', () => {
    expect(notice('Roku').root.textContent).toContain('Roku')
  })

  it('works without a display name', () => {
    const text = notice(null).root.textContent!
    expect(text).toContain('Premium')
    expect(text).not.toContain('signed in as')
  })

  it('does NOT offer to log in again, which is what caused the loop', () => {
    const { root } = notice()
    expect(root.querySelector('#login-btn')).toBeNull()
    expect(root.textContent!.toLowerCase()).not.toContain('log in with spotify')
  })

  it('offers a way out via sign out', () => {
    const { root, onSignOut } = notice()
    root.querySelector<HTMLButtonElement>('#premium-signout')!.click()
    expect(onSignOut).toHaveBeenCalledTimes(1)
  })

  it('links to Spotify Premium', () => {
    const link = notice().root.querySelector<HTMLAnchorElement>('.text-link')!
    expect(link.getAttribute('href')).toBe('https://www.spotify.com/premium/')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('escapes the display name', () => {
    const { root } = notice('<img src=x onerror=alert(1)>')
    expect(root.querySelector('img')).toBeNull()
  })
})
