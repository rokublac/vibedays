import type { Genre } from '../config/genres'
import { GENRES } from '../config/genres'

export interface GenreCallbacks {
  onSelect(genre: Genre): void
}

export interface GenreUI {
  update(current: Genre): void
  setBusy(busy: boolean): void
}

export function buildGenrePicker(root: HTMLElement, cb: GenreCallbacks): GenreUI {
  const items = GENRES.map(
    (g) => `<button class="account-menu-item genre-item" type="button"
              role="menuitemradio" aria-checked="false" data-genre="${g.id}">${g.label}</button>`,
  ).join('')

  root.innerHTML = `
    <div class="genre">
      <button id="genre-chip" class="genre-chip" type="button"
              aria-haspopup="menu" aria-expanded="false">
        <span class="genre-name"></span>
        <span class="genre-caret" aria-hidden="true"></span>
      </button>
      <div id="genre-menu" class="account-menu genre-menu" role="menu" hidden>
        <p class="account-menu-name">Genre</p>
        ${items}
      </div>
    </div>`

  const wrap = root.querySelector<HTMLDivElement>('.genre')!
  const chip = root.querySelector<HTMLButtonElement>('#genre-chip')!
  const name = root.querySelector<HTMLSpanElement>('.genre-name')!
  const menu = root.querySelector<HTMLDivElement>('#genre-menu')!

  function setOpen(open: boolean) {
    menu.hidden = !open
    chip.setAttribute('aria-expanded', String(open))
  }

  chip.addEventListener('click', (e) => {
    e.stopPropagation() // else the document handler below closes it immediately
    setOpen(menu.hidden)
  })

  root.querySelectorAll<HTMLButtonElement>('.genre-item').forEach((item) => {
    item.addEventListener('click', () => {
      setOpen(false)
      const picked = GENRES.find((g) => g.id === item.dataset.genre)
      if (picked) cb.onSelect(picked)
    })
  })

  // Dismiss like any other menu: click away or press Escape.
  root.ownerDocument.addEventListener('click', (e) => {
    if (!menu.hidden && !wrap.contains(e.target as Node)) setOpen(false)
  })
  root.ownerDocument.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) {
      setOpen(false)
      chip.focus()
    }
  })

  return {
    update(current: Genre) {
      name.textContent = current.label
      chip.setAttribute('aria-label', `Genre: ${current.label}`)
      root.querySelectorAll<HTMLButtonElement>('.genre-item').forEach((item) => {
        item.setAttribute('aria-checked', String(item.dataset.genre === current.id))
      })
    },

    /** Switching genre mid-search would strand the request that is in flight. */
    setBusy(busy: boolean) {
      chip.disabled = busy
      if (busy) setOpen(false)
    },
  }
}
