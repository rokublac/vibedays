export const ABOUT_TITLE = 'About'

export const AUDIUS_URL = 'https://audius.co'
export const AUTHOR = 'RB'
export const AUTHOR_URL = 'https://github.com/rokublac'

/**
 * Kept plain and short: four sentences, no jargon. These are HTML fragments,
 * not plain text, so the catalogue mention can carry its link.
 */
export const ABOUT_PARAGRAPHS = [
  'Plays music that fits your day. It checks the sun and the weather where you '
    + 'are, then finds music to match and changes it as the day goes on.',
  'The matching is a best guess. It works out the mood from the time, the sun '
    + 'and the weather, then searches for something that fits, so it might not '
    + 'always be spot on.',
  'Your location is used to look up sunrise, sunset and the current weather. '
    + 'It is never stored, and there is no server behind any of this.',
  'Music comes from <a class="text-link" href="' + AUDIUS_URL
    + '" target="_blank" rel="noopener noreferrer">Audius</a>, an open catalogue '
    + 'of independent artists. No account needed, and nothing to sign up for.',
]

export interface AboutOptions {
  onClose(): void
}

export function buildAbout(root: HTMLElement, opts: AboutOptions): void {
  root.innerHTML = `
    <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="about-title">
      <div class="modal-head">
        <h2 id="about-title">${ABOUT_TITLE}</h2>
        <button id="about-close" class="modal-close" type="button" aria-label="Close">&times;</button>
      </div>
      ${ABOUT_PARAGRAPHS.map((p) => `<p>${p}</p>`).join('')}
      <p class="about-credit">
        Created by <a class="text-link" href="${AUTHOR_URL}"
           target="_blank" rel="noopener noreferrer">${AUTHOR}</a>
      </p>
    </div>`

  root.querySelector('#about-close')!.addEventListener('click', () => opts.onClose())
}
