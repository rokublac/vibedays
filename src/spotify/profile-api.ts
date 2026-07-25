export interface SpotifyProfile {
  id: string
  displayName: string
  avatarUrl: string | null
  /** 'premium' | 'free' | 'open' — playback needs premium. */
  product: string | null
}

interface RawImage {
  url?: unknown
  width?: unknown
}

/** Smallest image at least 96px wide keeps a 48px avatar sharp on 2x displays. */
export function pickAvatar(images: unknown): string | null {
  if (!Array.isArray(images) || !images.length) return null
  const usable = images
    .filter((i): i is RawImage => !!i && typeof i === 'object')
    .filter((i) => typeof i.url === 'string' && i.url)
  if (!usable.length) return null
  const sized = usable.filter((i) => typeof i.width === 'number')
  if (!sized.length) return usable[0].url as string
  const ascending = [...sized].sort((a, b) => (a.width as number) - (b.width as number))
  const chosen = ascending.find((i) => (i.width as number) >= 96) ?? ascending[ascending.length - 1]
  return chosen.url as string
}

export async function fetchProfile(
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<SpotifyProfile> {
  const res = await fetchFn('https://api.spotify.com/v1/me', {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`profile request failed: ${res.status}${detail ? ` — ${detail}` : ''}`)
  }
  const data = (await res.json()) as Record<string, unknown>
  const id = typeof data.id === 'string' ? data.id : ''
  const name = typeof data.display_name === 'string' && data.display_name ? data.display_name : null

  return {
    id,
    // Display name is optional on Spotify accounts; the id is always there.
    displayName: name ?? id ?? 'Spotify user',
    avatarUrl: pickAvatar(data.images),
    product: typeof data.product === 'string' ? data.product : null,
  }
}

/** Initials for the fallback avatar when the account has no picture. */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
