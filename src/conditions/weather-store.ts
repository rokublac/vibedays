import type { WeatherDetail } from './weather'

export interface WeatherStore {
  /** The most recent successful reading, or null before the first one lands. */
  current(): WeatherDetail | null
  refresh(): Promise<void>
}

/**
 * Holds the latest weather, replacing it only when a new reading actually
 * arrives.
 *
 * The naive version cleared the field before awaiting the request. For the few
 * hundred milliseconds it was in flight the app had no weather at all, and the
 * once-a-second tick would recompute conditions with every band null. That
 * reads as a genuine change of conditions, so it switched playlist, then
 * switched back when the data landed.
 */
export function createWeatherStore(
  load: () => Promise<WeatherDetail>,
  onError?: (e: unknown) => void,
): WeatherStore {
  let latest: WeatherDetail | null = null

  return {
    current: () => latest,
    async refresh() {
      try {
        latest = await load()
      } catch (e) {
        // Stale weather is far closer to the truth than no weather.
        onError?.(e)
      }
    },
  }
}
