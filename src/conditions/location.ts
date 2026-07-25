import type { Coords } from '../types'

export function getBrowserLocation(): Promise<Coords> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('geolocation unavailable'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      (err) => reject(err),
      { timeout: 10_000 },
    )
  })
}

export async function geocodeCity(
  name: string,
  fetchFn: typeof fetch = fetch,
): Promise<Coords> {
  const url =
    `https://geocoding-api.open-meteo.com/v1/search` +
    `?name=${encodeURIComponent(name)}&count=1`
  const res = await fetchFn(url)
  if (!res.ok) throw new Error(`geocode request failed: ${res.status}`)
  const data = await res.json()
  if (!data.results || data.results.length === 0) throw new Error('city not found')
  return { latitude: data.results[0].latitude, longitude: data.results[0].longitude }
}

export async function reverseGeocode(
  coords: Coords,
  fetchFn: typeof fetch = fetch,
): Promise<string> {
  const url =
    `https://api.bigdatacloud.net/data/reverse-geocode-client` +
    `?latitude=${coords.latitude}&longitude=${coords.longitude}&localityLanguage=en`
  const res = await fetchFn(url)
  if (!res.ok) throw new Error(`reverse geocode failed: ${res.status}`)
  const d = await res.json()
  const parts = [d.city || d.locality, d.principalSubdivision, d.countryCode].filter(
    (p: string) => p,
  )
  return parts.join(', ')
}
