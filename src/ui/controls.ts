import type { Conditions } from '../types'
import { conditionWords, headline } from '../conditions/descriptors'
import { fadeSwap } from './fade-swap'

export const LOCATION_OFF = 'location off'

/** The overline: "CLEAR · COLD · WINTER", or a plain notice with no location. */
export function formatConditionLine(c: Conditions): string {
  if (!c.located) return LOCATION_OFF
  const words = conditionWords(c)
  return words.length ? words.join(' · ') : 'conditions unknown'
}

export function formatConditions(c: Conditions): string {
  // "location off, Evening" read as a contradiction. Without location the
  // phase still comes from the clock, so say that instead.
  if (!c.located) return `${headline(c)} (clock only)`
  return `${formatConditionLine(c)} · ${headline(c)}`
}

export interface ControlsCallbacks {
  onRetryLocation(): void
  onAbout(): void
  /** Resolve a typed city name to coordinates. Rejects if it cannot be found. */
  onUseCity(name: string): Promise<void>
}

export function buildControls(
  root: HTMLElement,
  cb: ControlsCallbacks,
): { update(c: Conditions): void } {
  root.innerHTML = `
    <div class="controls-head">
      <span class="readout-conditions"></span>
      <div class="head-actions">
        <div id="genre-slot"></div>
        <button id="about-btn" class="genre-chip" type="button">About</button>
      </div>
    </div>
    <p id="readout">
      <span class="readout-mood"></span>
    </p>
    <div id="location-hint" class="callout" hidden>
      <p class="callout-title">Location detection is off</p>
      <p class="callout-body">
        Turn it on for this site in your browser settings, or name a city and it
        will use that instead.
        <button id="location-retry" class="link-button" type="button">Try again</button>
      </p>
      <form id="city-form" class="city-form">
        <label class="city-label" for="city-input">City</label>
        <input id="city-input" class="city-input" type="text" autocomplete="address-level2"
               placeholder="e.g. Sydney" />
        <button class="btn-quiet" type="submit">Use city</button>
        <p id="city-error" class="city-error" role="alert" hidden></p>
      </form>
    </div>
  `

  const readout = root.querySelector<HTMLParagraphElement>('#readout')!
  const moodLine = root.querySelector<HTMLSpanElement>('.readout-mood')!
  const conditionLine = root.querySelector<HTMLSpanElement>('.readout-conditions')!
  const hint = root.querySelector<HTMLElement>('#location-hint')!

  root.querySelector('#location-retry')!.addEventListener('click', () => cb.onRetryLocation())
  root.querySelector('#about-btn')!.addEventListener('click', () => cb.onAbout())

  const cityForm = root.querySelector<HTMLFormElement>('#city-form')!
  const cityInput = root.querySelector<HTMLInputElement>('#city-input')!
  const cityError = root.querySelector<HTMLParagraphElement>('#city-error')!
  const citySubmit = cityForm.querySelector<HTMLButtonElement>('button[type=submit]')!

  cityForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    const name = cityInput.value.trim()
    if (!name) return
    cityError.hidden = true
    citySubmit.disabled = true
    try {
      await cb.onUseCity(name)
    } catch {
      // Wrong spellings and unknown places are the normal case here, not a fault.
      cityError.textContent = `Could not find "${name}". Try a different spelling.`
      cityError.hidden = false
    } finally {
      citySubmit.disabled = false
    }
  })

  return {
    update(c: Conditions) {
      // Without location the app is running on the clock alone, and cannot know
      // the hemisphere or the weather. Say so rather than guessing.
      hint.hidden = c.located
      const nextMood = headline(c)
      const nextConditions = formatConditionLine(c)
      if (moodLine.textContent === nextMood && conditionLine.textContent === nextConditions) return

      const write = () => {
        moodLine.textContent = nextMood
        conditionLine.textContent = nextConditions
      }
      // First paint has nothing to fade from, so skip straight to the content.
      if (moodLine.textContent === '') write()
      else fadeSwap([readout, conditionLine], write)
    },
  }
}
