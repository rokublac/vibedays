import type { Conditions, MatchResult } from '../types'
import { derivePalette } from './palette'
import { headline } from '../conditions/descriptors'

export function match(c: Conditions): MatchResult {
  return {
    label: headline(c),
    palette: derivePalette(c.phase, c.weather, c.season),
  }
}
