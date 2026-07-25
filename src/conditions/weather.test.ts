import { describe, it, expect, vi } from 'vitest'
import { wmoToWeatherKind, fetchWeather, fetchWeatherDetail } from './weather'

describe('wmoToWeatherKind', () => {
  it('maps WMO codes to buckets', () => {
    expect(wmoToWeatherKind(0)).toBe('clear')
    expect(wmoToWeatherKind(1)).toBe('clear')
    expect(wmoToWeatherKind(3)).toBe('cloudy')
    expect(wmoToWeatherKind(45)).toBe('fog')
    expect(wmoToWeatherKind(61)).toBe('rain')
    expect(wmoToWeatherKind(81)).toBe('rain')
    expect(wmoToWeatherKind(71)).toBe('snow')
    expect(wmoToWeatherKind(86)).toBe('snow')
    expect(wmoToWeatherKind(95)).toBe('storm')
  })
  it('defaults unknown codes to cloudy', () => {
    expect(wmoToWeatherKind(999)).toBe('cloudy')
  })
})

describe('fetchWeather', () => {
  it('requests Open-Meteo and maps the code', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ current: { weather_code: 61 } }),
    }) as unknown as typeof fetch
    const kind = await fetchWeather({ latitude: 51, longitude: 0 }, fakeFetch)
    expect(kind).toBe('rain')
    expect((fakeFetch as any).mock.calls[0][0]).toContain('latitude=51')
  })
  it('throws on non-ok response', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch
    await expect(fetchWeather({ latitude: 0, longitude: 0 }, fakeFetch)).rejects.toThrow()
  })
})

describe('fetchWeatherDetail', () => {
  it('returns the full detail set and requests every field it needs', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        current: {
          weather_code: 61, temperature_2m: 12.3, apparent_temperature: 9.8,
          cloud_cover: 88, precipitation: 0.4,
        },
        daily: { sunrise: ['2026-07-25T07:01'], sunset: ['2026-07-25T17:05'] },
      }),
    }) as unknown as typeof fetch
    const detail = await fetchWeatherDetail({ latitude: 51, longitude: 0 }, fakeFetch)
    expect(detail.code).toBe(61)
    expect(detail.kind).toBe('rain')
    expect(detail.temperatureC).toBe(12.3)
    expect(detail.apparentC).toBe(9.8)
    expect(detail.cloudCover).toBe(88)
    expect(detail.precipitationMm).toBe(0.4)
    expect(detail.sun!.sunrise.getHours()).toBe(7)
    expect(detail.sun!.sunset.getHours()).toBe(17)

    const url = (fakeFetch as any).mock.calls[0][0] as string
    for (const field of [
      'temperature_2m', 'apparent_temperature', 'cloud_cover', 'precipitation', 'sunrise', 'sunset',
    ]) expect(url).toContain(field)
  })

  it('survives a response missing the optional fields', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ current: { weather_code: 0, temperature_2m: 20 } }),
    }) as unknown as typeof fetch
    const detail = await fetchWeatherDetail({ latitude: 0, longitude: 0 }, fakeFetch)
    expect(detail.apparentC).toBeNull()
    expect(detail.cloudCover).toBeNull()
    expect(detail.precipitationMm).toBeNull()
    expect(detail.sun).toBeNull()
  })
  it('throws on non-ok', async () => {
    const fakeFetch = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch
    await expect(fetchWeatherDetail({ latitude: 0, longitude: 0 }, fakeFetch)).rejects.toThrow()
  })
})
