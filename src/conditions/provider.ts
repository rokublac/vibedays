import type { Conditions, Coords } from '../types'
import { computeSeason } from './season'
import { computeSunPhase } from './sun'
import { cloudBand, precipBand, tempBand } from './descriptors'
import type { WeatherDetail } from './weather'

export interface ProviderDeps {
  now: () => Date
  coords: Coords | null
  weather: WeatherDetail | null
}

/** Assembles the full condition set; every weather-derived band is null without it. */
export function resolveConditions(deps: ProviderDeps): Conditions {
  const date = deps.now()
  const w = deps.weather
  return {
    phase: computeSunPhase(date, w?.sun ?? null),
    season: computeSeason(date, deps.coords?.latitude ?? 0),
    weather: w?.kind ?? null,
    cloud: cloudBand(w?.cloudCover ?? null),
    precip: precipBand(w?.precipitationMm ?? null, w?.kind ?? null),
    temp: tempBand(w?.apparentC ?? w?.temperatureC ?? null),
  }
}
