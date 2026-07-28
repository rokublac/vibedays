/**
 * Daylight phases come from real sunrise/sunset; the after-dark ones come from
 * the clock, because "dark" and "bedtime" are different things. A 17:11 winter
 * sunset does not make 18:45 deep night.
 */
export type SunPhase =
  | 'late-night' | 'dawn' | 'sunrise-golden' | 'morning'
  | 'midday' | 'afternoon' | 'sunset-golden' | 'blue-hour'
  | 'evening' | 'deep-night'

export type Season = 'spring' | 'summer' | 'autumn' | 'winter'
export type WeatherKind = 'clear' | 'cloudy' | 'fog' | 'rain' | 'snow' | 'storm'

export type CloudBand = 'clear' | 'hazy' | 'scattered' | 'overcast'
export type PrecipBand = 'none' | 'sprinkle' | 'drizzle' | 'steady' | 'downpour' | 'snowing'
export type TempBand = 'freezing' | 'cold' | 'mild' | 'warm' | 'hot'

export type ParticleType = 'none' | 'rain' | 'snow' | 'motes'

export interface Coords {
  latitude: number
  longitude: number
}

export interface Conditions {
  /** False when geolocation was denied or unavailable. */
  located: boolean
  phase: SunPhase
  season: Season
  weather: WeatherKind | null
  cloud: CloudBand | null
  precip: PrecipBand | null
  temp: TempBand | null
}

export interface Palette {
  gradient: [string, string] // [top, bottom]
  fg: string // body text; paired with the gradient to hold WCAG AA contrast
  accent: string
  particles: ParticleType
  /** Stops for the corner wordmark, deepened on the light phases. */
  brandRainbow: string[]
}

export interface MatchResult {
  /** Human-readable headline for the current conditions, e.g. "Golden hour". */
  label: string
  palette: Palette
}

/** Where playback is coming from — the mood, playlist, or whatever the source calls it. */
export interface PlaybackContext {
  label: string
  url: string | null
}

/** What the now-playing card needs, flattened out of whatever the source reports. */
export interface TrackInfo {
  name: string
  artists: string
  artworkUrl: string | null
  url: string | null
  context: PlaybackContext | null
}
