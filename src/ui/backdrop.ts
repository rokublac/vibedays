import type { Palette } from '../types'

// Palette variables go on :root, not on the backdrop element — #backdrop is a
// sibling of #app and #overlay, so anything set on it cannot cascade to the UI.
// data-particles stays on the element itself, which is what #backdrop::after reads.
export function applyPalette(root: HTMLElement, p: Palette): void {
  const vars = root.ownerDocument.documentElement.style
  vars.setProperty('--grad-top', p.gradient[0])
  vars.setProperty('--grad-bottom', p.gradient[1])
  vars.setProperty('--fg', p.fg)
  vars.setProperty('--accent', p.accent)
  root.dataset.particles = p.particles
}
