import type { Season } from '../types'

const NORTHERN_BY_MONTH: Season[] = [
  'winter', 'winter', // Jan, Feb
  'spring', 'spring', 'spring', // Mar, Apr, May
  'summer', 'summer', 'summer', // Jun, Jul, Aug
  'autumn', 'autumn', 'autumn', // Sep, Oct, Nov
  'winter', // Dec
]

const SOUTHERN_FLIP: Record<Season, Season> = {
  spring: 'autumn',
  summer: 'winter',
  autumn: 'spring',
  winter: 'summer',
}

export function computeSeason(date: Date, latitude: number): Season {
  const northern = NORTHERN_BY_MONTH[date.getMonth()]
  return latitude >= 0 ? northern : SOUTHERN_FLIP[northern]
}
