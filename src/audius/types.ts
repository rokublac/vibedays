/** The narrow shape the app uses; the raw API object carries ~90 fields. */
export interface AudiusTrack {
  id: string
  title: string
  duration: number
  /** "/handle/slug" — prefix with https://audius.co for a permalink. */
  permalink: string
  artworkUrl: string | null
  artist: string
}
