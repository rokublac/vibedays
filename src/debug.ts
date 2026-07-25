/**
 * Boundary logging for the play path: click → search → choose → play → SDK.
 * Prefixed so it can be filtered in the console with `[hb]`.
 *
 * Dev only. Production builds strip these calls rather than shipping a noisy
 * console to anyone running the app.
 */
export function debug(stage: string, detail?: unknown): void {
  if (!import.meta.env.DEV) return
  if (detail === undefined) console.info(`[hb] ${stage}`)
  else console.info(`[hb] ${stage}`, detail)
}
