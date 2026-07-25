import type { SunPhase, WeatherKind, Season, Palette, ParticleType } from '../types'

/**
 * Each gradient is paired with a foreground below, and both stops (plus
 * everything between) must clear 4.5:1 against it — including the 75% muted
 * tier, which needs roughly 6.3:1 at full strength. palette.test.ts asserts
 * this across every phase, so new gradients cannot be added blind.
 */
const GRADIENT_BY_PHASE: Record<SunPhase, [string, string]> = {
  // The night side darkens as the routine does: evening → deep night → 3am.
  evening: ['#2b2b52', '#16162e'],
  'deep-night': ['#12122a', '#08081a'],
  'late-night': ['#0a0a14', '#05050c'],
  dawn: ['#2a2a4a', '#4a4a6a'],
  'sunrise-golden': ['#ffd9a0', '#ffb37d'],
  morning: ['#ffd9a0', '#a0c4ff'],
  midday: ['#a0c4ff', '#dfefff'],
  afternoon: ['#8fb8f5', '#cfe4ff'],
  // Deepened well past a literal golden: a mid-luminance warm gradient fails
  // both dark and light text, so it has to commit to one end. #85381c is the
  // shallowest tested value that keeps the muted tier above 4.5:1.
  'sunset-golden': ['#85381c', '#442749'],
  'blue-hour': ['#3d3a6b', '#1a1a3a'],
}

const INK = '#1a1a2e'
const PAPER = '#f5f5f5'

const FG_BY_PHASE: Record<SunPhase, string> = {
  evening: PAPER,
  'deep-night': PAPER,
  'late-night': PAPER,
  dawn: PAPER,
  'sunrise-golden': INK,
  morning: INK,
  midday: INK,
  afternoon: INK,
  'sunset-golden': PAPER,
  'blue-hour': PAPER,
}

const ACCENT_BY_SEASON: Record<Season, string> = {
  spring: '#8ecae6',
  summer: '#ffd166',
  autumn: '#e07a5f',
  winter: '#cde7ff',
}

export function particlesFor(weather: WeatherKind | null): ParticleType {
  if (weather === 'rain' || weather === 'storm') return 'rain'
  if (weather === 'snow') return 'snow'
  return 'motes'
}

export function derivePalette(
  phase: SunPhase,
  weather: WeatherKind | null,
  season: Season,
): Palette {
  return {
    gradient: GRADIENT_BY_PHASE[phase],
    fg: FG_BY_PHASE[phase],
    accent: ACCENT_BY_SEASON[season],
    particles: particlesFor(weather),
  }
}
