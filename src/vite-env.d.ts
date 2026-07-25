/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Spotify app Client ID. Public identifier, not a secret. */
  readonly VITE_SPOTIFY_CLIENT_ID?: string
  /** Set to "true" to print the [hb] play-path logs in dev. */
  readonly VITE_DEBUG?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
