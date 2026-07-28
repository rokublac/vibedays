import type { AudiusTrack } from './types'

export const HOST = 'https://discoveryprovider.audius.co'
/** Free-text identifier; Audius asks for one but does not issue keys. */
export const APP_NAME = 'vibedays'

/**
 * Measured over 1193 tracks: the duration tail runs to 3.7-hour DJ mixes and
 * whole albums uploaded as one track, while p5 is 79s of loops and stingers.
 * Neither belongs in a player that follows the weather — a 45-minute mix makes
 * "next" inert. This band keeps 95% of the catalogue.
 */
export const MIN_DURATION = 60
export const MAX_DURATION = 900
export const PAGE_SIZE = 100

/**
 * Phrases that name a commercial service. Companies upload spoken content
 * marketing tagged as music — a contract-software firm's piece was playing
 * between two lofi tracks — and nothing else catches it: the genre and mood
 * are set to whatever gets it heard, and the audio is a normal length.
 *
 * Titles only. Lofi descriptions genuinely advertise themselves as "perfect
 * for productivity and workflow", so screening descriptions flagged seven good
 * tracks for every real one. Measured over 1019 tracks from the app's own
 * queries, this rejects exactly one, and it is the right one.
 */
const NOT_MUSIC = new RegExp(
  '\\b(software|saas|crm|erp|b2b'
    + '|contract management|project management|supply chain'
    + '|insurance|mortgage|attorney|law firm|dentist|dental'
    + '|webinar|whitepaper|case study|digital marketing)\\b',
  'i',
)

/** False for uploads that are advertising rather than music. */
export function isMusic(raw: unknown): boolean {
  const title = (raw as { title?: unknown } | null)?.title
  if (typeof title !== 'string') return true
  return !NOT_MUSIC.test(title)
}

export interface SearchParams {
  genre?: string
  mood?: string
  query?: string
  offset?: number
}

interface RawTrack {
  id?: unknown
  title?: unknown
  duration?: unknown
  permalink?: unknown
  user?: { name?: unknown } | null
  artwork?: Record<string, unknown> | null
  is_streamable?: unknown
  is_delete?: unknown
  is_available?: unknown
  is_stream_gated?: unknown
}

export function isPlayable(raw: unknown): boolean {
  const t = raw as RawTrack | null
  if (!t || typeof t !== 'object') return false
  if (typeof t.id !== 'string' || !t.id) return false
  if (t.is_streamable !== true) return false
  if (t.is_delete === true) return false
  if (t.is_available === false) return false
  // Gated tracks need a signature from the listener's wallet, which a
  // login-free app by definition does not have.
  if (t.is_stream_gated === true) return false
  if (!isMusic(t)) return false
  const d = t.duration
  return typeof d === 'number' && d >= MIN_DURATION && d <= MAX_DURATION
}

/** Maps a raw track, or null when it is not playable — filter and map in one pass. */
export function toTrack(raw: unknown): AudiusTrack | null {
  if (!isPlayable(raw)) return null
  const t = raw as RawTrack
  const art = t.artwork ?? {}
  // The card renders at 80px, so 480 is the smallest that stays sharp at 2x.
  const artworkUrl =
    (typeof art['480x480'] === 'string' ? art['480x480'] : null) ??
    (typeof art['150x150'] === 'string' ? art['150x150'] : null)
  return {
    id: t.id as string,
    title: typeof t.title === 'string' ? t.title : '',
    duration: t.duration as number,
    permalink: typeof t.permalink === 'string' ? t.permalink : '',
    artworkUrl,
    artist: typeof t.user?.name === 'string' ? t.user.name : '',
  }
}

/**
 * 302s to a CDN that serves audio/mpeg with accept-ranges and CORS *, so this
 * can be assigned straight to an <audio> element's src.
 */
export function streamUrl(id: string): string {
  return `${HOST}/v1/tracks/${encodeURIComponent(id)}/stream?app_name=${APP_NAME}`
}

export async function searchTracks(
  p: SearchParams,
  fetchFn: typeof fetch = fetch,
): Promise<AudiusTrack[]> {
  const params = new URLSearchParams({
    query: p.query ?? '',
    app_name: APP_NAME,
    limit: String(PAGE_SIZE),
  })
  if (p.genre) params.set('genre', p.genre)
  if (p.mood) params.set('mood', p.mood)
  if (p.offset) params.set('offset', String(p.offset))

  const res = await fetchFn(`${HOST}/v1/tracks/search?${params}`)
  if (!res.ok) throw new Error(`audius search failed: ${res.status}`)
  const body = (await res.json()) as { data?: unknown[] }
  return (body.data ?? []).map(toTrack).filter((t): t is AudiusTrack => t !== null)
}
