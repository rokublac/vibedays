import type { WeatherKind, Coords } from '../types'
import { parseSunTimes, type SunTimes } from './sun'

export function wmoToWeatherKind(code: number): WeatherKind {
  if (code === 0 || code === 1) return 'clear'
  if (code === 2 || code === 3) return 'cloudy'
  if (code === 45 || code === 48) return 'fog'
  if (code >= 51 && code <= 67) return 'rain'
  if (code >= 71 && code <= 77) return 'snow'
  if (code >= 80 && code <= 82) return 'rain'
  if (code === 85 || code === 86) return 'snow'
  if (code >= 95 && code <= 99) return 'storm'
  return 'cloudy'
}

export interface WeatherDetail {
  code: number
  kind: WeatherKind
  temperatureC: number
  /** Feels-like, so wind chill counts toward the temperature band. */
  apparentC: number | null
  cloudCover: number | null
  precipitationMm: number | null
  sun: SunTimes | null
}

const CURRENT = 'weather_code,temperature_2m,apparent_temperature,cloud_cover,precipitation'

/** One request covers both current conditions and today's sun times. */
export async function fetchWeatherDetail(
  coords: Coords,
  fetchFn: typeof fetch = fetch,
): Promise<WeatherDetail> {
  const url =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${coords.latitude}&longitude=${coords.longitude}` +
    `&current=${CURRENT}` +
    '&daily=sunrise,sunset&forecast_days=1&timezone=auto'
  const res = await fetchFn(url)
  if (!res.ok) throw new Error(`weather request failed: ${res.status}`)
  const data = await res.json()
  return parseWeatherDetail(data)
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export function parseWeatherDetail(data: unknown): WeatherDetail {
  const d = data as {
    current?: Record<string, unknown>
    daily?: { sunrise?: unknown; sunset?: unknown }
  }
  const current = d.current ?? {}
  const code = num(current.weather_code) ?? 3
  const daily = d.daily ?? {}
  const first = (v: unknown) => (Array.isArray(v) ? (v[0] as string | undefined) : undefined)

  return {
    code,
    kind: wmoToWeatherKind(code),
    temperatureC: num(current.temperature_2m) ?? 0,
    apparentC: num(current.apparent_temperature),
    cloudCover: num(current.cloud_cover),
    precipitationMm: num(current.precipitation),
    sun: parseSunTimes(first(daily.sunrise), first(daily.sunset)),
  }
}

export async function fetchWeather(
  coords: Coords,
  fetchFn: typeof fetch = fetch,
): Promise<WeatherKind> {
  return (await fetchWeatherDetail(coords, fetchFn)).kind
}
