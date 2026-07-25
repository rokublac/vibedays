export interface LoginOptions {
  /** Live condition summary, so the app visibly works before you sign in. */
  summary: string
  onLogin(): void
}

export function buildLogin(root: HTMLElement, opts: LoginOptions): void {
  root.innerHTML = `
    <div class="login-card">
      <h2>Lofi that fits your day</h2>
      <p>
        It checks the sun and the weather where you are, then plays lofi to
        match. When the day changes, so does the music.
      </p>
      <p class="detected">Right now: <strong>${escapeHtml(opts.summary)}</strong></p>
      <button id="login-btn" type="button">Log in with Spotify</button>
      <p class="fineprint">You'll need Spotify Premium to play.</p>
    </div>`

  root.querySelector('#login-btn')!.addEventListener('click', () => opts.onLogin())
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
