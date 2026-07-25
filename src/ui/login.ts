export interface LoginOptions {
  /** Live condition summary, so the app visibly works before you sign in. */
  summary: string
  onLogin(): void
}

export function buildLogin(root: HTMLElement, opts: LoginOptions): void {
  root.innerHTML = `
    <div class="login-card">
      <h2>Match your mood with music</h2>
      <p>
        Fetches your season, time of day, weather and other mood metrics and plays ambient music to match your mood.
      </p>
      <p class="detected">Detected mood: <strong>${escapeHtml(opts.summary)}</strong></p>
      <button id="login-btn" type="button">Log in with Spotify</button>
      <p class="fineprint">
        <a class="text-link" href="https://www.spotify.com/premium/"
           target="_blank" rel="noopener noreferrer">Spotify Premium account</a> is required.
      </p>
    </div>`

  root.querySelector('#login-btn')!.addEventListener('click', () => opts.onLogin())
}

export interface PremiumNoticeOptions {
  /** Who is signed in, so it is obvious which account is the problem. */
  displayName: string | null
  onSignOut(): void
}

/**
 * Shown when a signed-in account cannot stream. Deliberately not the login
 * card: sending a free user back to "Log in with Spotify" is what created the
 * loop, because signing in again changes nothing.
 */
export function buildPremiumNotice(root: HTMLElement, opts: PremiumNoticeOptions): void {
  const who = opts.displayName
    ? `You're signed in as <strong>${escapeHtml(opts.displayName)}</strong>, but playback`
    : 'Playback'

  root.innerHTML = `
    <div class="login-card">
      <h2>This needs Spotify Premium</h2>
      <p>
        ${who} only works on a Premium account. Spotify doesn't allow
        free accounts to stream through the web player, so there's nothing the
        app can do about it.
      </p>
      <p class="fineprint">
        Have a look at <a class="text-link" href="https://www.spotify.com/premium/"
           target="_blank" rel="noopener noreferrer">Spotify Premium</a>,
        or sign out and use another account.
      </p>
      <button id="premium-signout" type="button">Sign out</button>
    </div>`

  root.querySelector('#premium-signout')!.addEventListener('click', () => opts.onSignOut())
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
