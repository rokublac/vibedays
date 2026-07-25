export async function playPlaylist(
  token: string,
  deviceId: string,
  playlistId: string,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  const url = `https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(deviceId)}`
  const res = await fetchFn(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ context_uri: `spotify:playlist:${playlistId}` }),
  })
  if (!res.ok) throw new Error(`play request failed: ${res.status}`)
}
