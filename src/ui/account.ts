import type { SpotifyProfile } from '../spotify/profile-api'
import { initialsOf } from '../spotify/profile-api'

export interface AccountCallbacks {
  onSignIn(): void
  onSignOut(): void
  onAbout(): void
}

export interface AccountUI {
  /** Pass null when signed out. */
  update(profile: SpotifyProfile | null): void
  close(): void
}

export function buildAccount(root: HTMLElement, cb: AccountCallbacks): AccountUI {
  root.innerHTML = `
    <button id="sign-in" class="btn-quiet" type="button" hidden>Sign in with Spotify</button>
    <div class="account" hidden>
      <button id="account-chip" class="account-chip" type="button"
              aria-haspopup="menu" aria-expanded="false">
        <span class="account-avatar" aria-hidden="true">
          <img class="account-avatar-img" alt="" width="32" height="32" hidden />
          <span class="account-initials"></span>
        </span>
        <span class="account-name"></span>
      </button>
      <div id="account-menu" class="account-menu" role="menu" hidden>
        <p class="account-menu-name"></p>
        <button id="about" class="account-menu-item" type="button" role="menuitem">About</button>
        <button id="sign-out" class="account-menu-item" type="button" role="menuitem">Sign out</button>
      </div>
    </div>`

  const signIn = root.querySelector<HTMLButtonElement>('#sign-in')!
  const account = root.querySelector<HTMLDivElement>('.account')!
  const chip = root.querySelector<HTMLButtonElement>('#account-chip')!
  const avatarImg = root.querySelector<HTMLImageElement>('.account-avatar-img')!
  const initials = root.querySelector<HTMLSpanElement>('.account-initials')!
  const name = root.querySelector<HTMLSpanElement>('.account-name')!
  const menu = root.querySelector<HTMLDivElement>('#account-menu')!
  const menuName = root.querySelector<HTMLParagraphElement>('.account-menu-name')!

  function setOpen(open: boolean) {
    menu.hidden = !open
    chip.setAttribute('aria-expanded', String(open))
  }

  chip.addEventListener('click', (e) => {
    e.stopPropagation() // else the document handler below closes it immediately
    setOpen(menu.hidden)
  })
  signIn.addEventListener('click', () => cb.onSignIn())
  root.querySelector('#sign-out')!.addEventListener('click', () => {
    setOpen(false)
    cb.onSignOut()
  })
  root.querySelector('#about')!.addEventListener('click', () => {
    setOpen(false)
    cb.onAbout()
  })

  // Dismiss like any other menu: click away or press Escape.
  root.ownerDocument.addEventListener('click', (e) => {
    if (!menu.hidden && !account.contains(e.target as Node)) setOpen(false)
  })
  root.ownerDocument.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) {
      setOpen(false)
      chip.focus()
    }
  })

  return {
    update(profile: SpotifyProfile | null) {
      if (!profile) {
        signIn.hidden = false
        account.hidden = true
        setOpen(false)
        return
      }
      signIn.hidden = true
      account.hidden = false
      name.textContent = profile.displayName
      menuName.textContent = profile.displayName
      chip.setAttribute('aria-label', `Account: ${profile.displayName}`)

      // Many Spotify accounts have no picture, so initials are the normal case.
      // Set via <img src>, not a CSS url(), so the remote value can't inject CSS.
      if (profile.avatarUrl) {
        avatarImg.src = profile.avatarUrl
        avatarImg.hidden = false
        initials.textContent = ''
      } else {
        avatarImg.removeAttribute('src')
        avatarImg.hidden = true
        initials.textContent = initialsOf(profile.displayName)
      }
    },
    close: () => setOpen(false),
  }
}
