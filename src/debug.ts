export const DEBUG_KEY = 'hb_debug'

/**
 * Off unless explicitly asked for, even in dev: the play path logs a dozen
 * lines per action, which buries anything else in the console.
 *
 * Turn it on either way:
 *   VITE_DEBUG=true in .env            (persistent, needs a dev server restart)
 *   localStorage.hb_debug = '1'        (immediate, no restart, per browser)
 */
export function shouldLog(
  isDev: boolean,
  envFlag: string | undefined,
  read: (key: string) => string | null,
): boolean {
  // Never in production, whatever the flags say.
  if (!isDev) return false
  if (envFlag === 'true' || envFlag === '1') return true
  try {
    return read(DEBUG_KEY) === '1' || read(DEBUG_KEY) === 'true'
  } catch {
    // Storage access can throw in private browsing.
    return false
  }
}

function enabled(): boolean {
  return shouldLog(
    import.meta.env.DEV,
    import.meta.env.VITE_DEBUG,
    (key) => localStorage.getItem(key),
  )
}

/**
 * Boundary logging for the play path: click → search → choose → play → SDK.
 * Prefixed so it can be filtered in the console with `[hb]`.
 */
export function debug(stage: string, detail?: unknown): void {
  // Read per call, so flipping localStorage takes effect without a reload.
  if (!enabled()) return
  if (detail === undefined) console.info(`[hb] ${stage}`)
  else console.info(`[hb] ${stage}`, detail)
}
