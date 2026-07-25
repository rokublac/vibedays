/**
 * Boundary logging for the play path: click → search → choose → play → SDK.
 * Prefixed so it can be filtered in the console with `[hb]`.
 */
export function debug(stage: string, detail?: unknown): void {
  if (detail === undefined) console.info(`[hb] ${stage}`)
  else console.info(`[hb] ${stage}`, detail)
}
