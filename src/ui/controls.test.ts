import { describe, it, expect, vi } from 'vitest'
import { formatConditions, formatConditionLine, buildControls, LOCATION_OFF } from './controls'

const C = {
  located: true,
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
    expect(formatConditions(C)).toBe('clear · cold · winter · Golden hour')
  })
})

describe('without location', () => {
  const NO_GEO = { ...C, located: false } as const

  it('does not pair "location off" with a phase, which read as a contradiction', () => {
    const summary = formatConditions(NO_GEO)
    expect(summary).toBe('Golden hour (clock only)')
    expect(summary).not.toContain('location off')
  })

  it('says location is off instead of naming conditions it cannot know', () => {
    expect(formatConditionLine(NO_GEO)).toBe(LOCATION_OFF)
  })

  it('never claims a season, which needs latitude for the hemisphere', () => {
    // It assumed latitude 0 and reported "summer" during an Australian winter.
    expect(formatConditionLine(NO_GEO)).not.toContain('winter')
    expect(formatConditionLine(NO_GEO)).not.toContain('summer')
  })

  it('shows the hint, and hides it once location arrives', () => {
    const root = document.createElement('div')
    const controls = buildControls(root, { onRetryLocation: vi.fn(), onUseCity: vi.fn() })
    const hint = root.querySelector<HTMLElement>('#location-hint')!

    controls.update(NO_GEO)
    expect(hint.hidden).toBe(false)
    expect(hint.textContent).toContain('browser settings')

    controls.update(C)
    expect(hint.hidden).toBe(true)
  })

  it('offers naming a city, so a refused permission is not a dead end', () => {
    const root = document.createElement('div')
    buildControls(root, { onRetryLocation: vi.fn(), onUseCity: vi.fn() }).update(NO_GEO)
    expect(root.querySelector('#city-input')).not.toBeNull()
    expect(root.querySelector('#city-form')).not.toBeNull()
  })

  it('resolves the typed city', async () => {
    const root = document.createElement('div')
    const onUseCity = vi.fn().mockResolvedValue(undefined)
    buildControls(root, { onRetryLocation: vi.fn(), onUseCity }).update(NO_GEO)

    root.querySelector<HTMLInputElement>('#city-input')!.value = '  Sydney  '
    root.querySelector<HTMLFormElement>('#city-form')!.dispatchEvent(
      new Event('submit', { cancelable: true }),
    )
    await Promise.resolve()
    expect(onUseCity).toHaveBeenCalledWith('Sydney')
  })

  it('ignores an empty submission', async () => {
    const root = document.createElement('div')
    const onUseCity = vi.fn()
    buildControls(root, { onRetryLocation: vi.fn(), onUseCity }).update(NO_GEO)
    root.querySelector<HTMLFormElement>('#city-form')!.dispatchEvent(
      new Event('submit', { cancelable: true }),
    )
    await Promise.resolve()
    expect(onUseCity).not.toHaveBeenCalled()
  })

  it('says so when the city cannot be found, rather than failing silently', async () => {
    const root = document.createElement('div')
    const onUseCity = vi.fn().mockRejectedValue(new Error('city not found'))
    buildControls(root, { onRetryLocation: vi.fn(), onUseCity }).update(NO_GEO)

    root.querySelector<HTMLInputElement>('#city-input')!.value = 'Nowhereville'
    root.querySelector<HTMLFormElement>('#city-form')!.dispatchEvent(
      new Event('submit', { cancelable: true }),
    )
    await new Promise((r) => setTimeout(r, 0))

    const err = root.querySelector<HTMLElement>('#city-error')!
    expect(err.hidden).toBe(false)
    expect(err.textContent).toContain('Nowhereville')
  })

  it('re-enables the button after a failure, so it can be retried', async () => {
    const root = document.createElement('div')
    const onUseCity = vi.fn().mockRejectedValue(new Error('nope'))
    buildControls(root, { onRetryLocation: vi.fn(), onUseCity }).update(NO_GEO)
    const submit = root.querySelector<HTMLButtonElement>('#city-form button[type=submit]')!

    root.querySelector<HTMLInputElement>('#city-input')!.value = 'X'
    root.querySelector<HTMLFormElement>('#city-form')!.dispatchEvent(
      new Event('submit', { cancelable: true }),
    )
    await new Promise((r) => setTimeout(r, 0))
    expect(submit.disabled).toBe(false)
  })

  it('offers a retry, for after the site permission is changed', () => {
    const root = document.createElement('div')
    const onRetryLocation = vi.fn()
    buildControls(root, { onRetryLocation, onUseCity: vi.fn() }).update(NO_GEO)
    root.querySelector<HTMLButtonElement>('#location-retry')!.click()
    expect(onRetryLocation).toHaveBeenCalledTimes(1)
  })
})

describe('buildControls', () => {
  it('renders the headline and conditions into separate lines of the readout', () => {
    const root = document.createElement('div')
    const controls = buildControls(root, { onRetryLocation: vi.fn(), onUseCity: vi.fn() })
    controls.update(C)
    expect(root.querySelector('.readout-mood')!.textContent).toBe('Golden hour')
    expect(root.querySelector('.readout-conditions')!.textContent).toBe('clear · cold · winter')
  })



  it('renders no override selects', () => {
    const root = document.createElement('div')
    buildControls(root, { onRetryLocation: vi.fn(), onUseCity: vi.fn() })
    expect(root.querySelectorAll('select')).toHaveLength(0)
  })
})
