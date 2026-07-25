import { describe, it, expect, vi } from 'vitest'
import { buildLogin, escapeHtml } from './login'

const mount = (summary = 'clear · cold · winter → Deep night') => {
  const root = document.createElement('div')
  const onLogin = vi.fn()
  buildLogin(root, { summary, onLogin })
  return { root, onLogin }
}

describe('buildLogin', () => {
  it('explains what the app does', () => {
    const { root } = mount()
    const text = root.textContent!
    expect(text).toContain('the sun and the weather')
    expect(text).toContain('lofi')
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
