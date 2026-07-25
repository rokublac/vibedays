import type { Conditions } from '../types'
import { conditionWords, headline } from '../conditions/descriptors'
import { fadeSwap } from './fade-swap'

/** The overline: "CLEAR · COLD · WINTER". */
export function formatConditionLine(c: Conditions): string {
  const words = conditionWords(c)
  return words.length ? words.join(' · ') : 'conditions unknown'
}

export function formatConditions(c: Conditions): string {
  return `${formatConditionLine(c)} → ${headline(c)}`
}

export function buildControls(
  root: HTMLElement,
): { update(c: Conditions): void } {
  root.innerHTML = `
    <div class="controls-head">
      <span class="readout-conditions"></span>
      <div class="head-actions">
        <div id="genre-slot"></div>
        <div id="account-slot"></div>
      </div>
    </div>
    <p id="readout">
      <span class="readout-mood"></span>
    </p>
  `

  const readout = root.querySelector<HTMLParagraphElement>('#readout')!
  const moodLine = root.querySelector<HTMLSpanElement>('.readout-mood')!
  const conditionLine = root.querySelector<HTMLSpanElement>('.readout-conditions')!

  return {
    update(c: Conditions) {
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
