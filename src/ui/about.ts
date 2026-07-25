export const ABOUT_TITLE = 'About'

export const PREMIUM_URL = 'https://www.spotify.com/premium/'
export const AUTHOR = 'RB'
export const AUTHOR_URL = 'https://github.com/rokublac'

/**
 * Kept plain and short: three sentences, no jargon. These are HTML fragments,
 * not plain text, so the Premium mention can carry its link.
 */
export const ABOUT_PARAGRAPHS = [
  'Plays music that fits your day. It checks the sun and the weather where you '
    + 'are, then finds a playlist to match and swaps it as the day goes on.',
  'The matching is a best guess. It works out the mood from the time, the sun '
    + 'and the weather, then searches Spotify for something that fits, so the '
    + 'playlist might not always be spot on.',
  'Your location is used to look up sunrise, sunset and the current weather. '
    + 'It is never stored, and there is no server behind any of this.',
  'Playback runs through Spotify, so a <a class="text-link" href="' + PREMIUM_URL
    + '" target="_blank" rel="noopener noreferrer">Premium account</a> is required '
    + 'for this to work.',
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
