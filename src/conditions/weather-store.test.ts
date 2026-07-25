import { describe, it, expect, vi } from 'vitest'
import { createWeatherStore } from './weather-store'
import type { WeatherDetail } from './weather'

const detail = (temperatureC: number): WeatherDetail => ({
  code: 0,
  kind: 'clear',
  temperatureC,
  apparentC: temperatureC,
  cloudCover: 5,
  precipitationMm: 0,
  sun: null,
})

describe('createWeatherStore', () => {
  it('is empty until the first reading lands', async () => {
    const store = createWeatherStore(async () => detail(10))
    expect(store.current()).toBeNull()
    await store.refresh()
    expect(store.current()!.temperatureC).toBe(10)
  })

  it('keeps the previous reading for the whole time a refresh is in flight', async () => {
    let release!: (d: WeatherDetail) => void
    const pending = new Promise<WeatherDetail>((r) => { release = r })

    const store = createWeatherStore(
      vi.fn().mockResolvedValueOnce(detail(10)).mockReturnValueOnce(pending),
    )
    await store.refresh()

    const inFlight = store.refresh()
    // This is the window the once-a-second tick used to see as "no weather",
    // which changed the condition signature and switched playlist.
    expect(store.current()!.temperatureC).toBe(10)

    release(detail(20))
    await inFlight
    expect(store.current()!.temperatureC).toBe(20)
  })

  it('keeps the previous reading when a refresh fails', async () => {
    const load = vi.fn()
      .mockResolvedValueOnce(detail(10))
      .mockRejectedValueOnce(new Error('offline'))
    const store = createWeatherStore(load)

    await store.refresh()
    await store.refresh()
    expect(store.current()!.temperatureC).toBe(10)
  })

  it('never rejects, so a failed poll cannot break the tick', async () => {
    const store = createWeatherStore(async () => { throw new Error('offline') })
    await expect(store.refresh()).resolves.toBeUndefined()
    expect(store.current()).toBeNull()
  })

  it('reports failures without discarding state', async () => {
    const onError = vi.fn()
    const store = createWeatherStore(
      vi.fn().mockResolvedValueOnce(detail(10)).mockRejectedValueOnce(new Error('boom')),
      onError,
    )
    await store.refresh()
    await store.refresh()
    expect(onError).toHaveBeenCalledTimes(1)
    expect(store.current()!.temperatureC).toBe(10)
  })

  it('recovers on the next successful poll', async () => {
    const load = vi.fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(detail(15))
    const store = createWeatherStore(load)

    await store.refresh()
    expect(store.current()).toBeNull()
    await store.refresh()
    expect(store.current()!.temperatureC).toBe(15)
  })
})
