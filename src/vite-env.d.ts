/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Set to "true" to print the [hb] play-path logs in dev. */
  readonly VITE_DEBUG?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
