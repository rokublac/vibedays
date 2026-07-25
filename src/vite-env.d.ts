/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Spotify app Client ID. Public identifier, not a secret. */
  readonly VITE_SPOTIFY_CLIENT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
