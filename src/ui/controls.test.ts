import { describe, it, expect } from 'vitest'
import { formatConditions, formatConditionLine, buildControls } from './controls'

const C = {
  phase: 'sunset-golden',
  season: 'winter',
  weather: 'clear',
  cloud: 'clear',
  precip: 'none',
  temp: 'cold',
} as const

describe('formatConditionLine', () => {
  it('lists the bands, skipping ones that add nothing', () => {
    expect(formatConditionLine(C)).toBe('clear · cold · winter')
  })
  it('omits precipitation when there is none', () => {
    expect(formatConditionLine(C)).not.toContain('none')
  })
  it('includes precipitation when there is some', () => {
    expect(formatConditionLine({ ...C, precip: 'drizzle' })).toContain('drizzle')
  })
  it('says so when nothing is known', () => {
    expect(formatConditionLine({ ...C, cloud: null, precip: null, temp: null, season: 'winter' }))
      .toBe('winter')
  })
})

describe('formatConditions', () => {
  it('pairs the conditions with the headline', () => {
    expect(formatConditions(C)).toBe('clear · cold · winter → Golden hour')
  })
})

describe('buildControls', () => {
  it('renders the headline and conditions into separate lines of the readout', () => {
    const root = document.createElement('div')
    const controls = buildControls(root)
    controls.update(C)
    expect(root.querySelector('.readout-mood')!.textContent).toBe('Golden hour')
    expect(root.querySelector('.readout-conditions')!.textContent).toBe('clear · cold · winter')
  })



  it('renders no override selects', () => {
    const root = document.createElement('div')
    buildControls(root)
    expect(root.querySelectorAll('select')).toHaveLength(0)
  })
})
