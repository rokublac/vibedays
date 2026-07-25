import { describe, it, expect } from 'vitest'
import { shouldLog, DEBUG_KEY } from './debug'

const none = () => null
const stored = (value: string | null) => (key: string) => (key === DEBUG_KEY ? value : null)

describe('shouldLog', () => {
  it('is off in dev unless asked for', () => {
    // The play path logs a dozen lines per action; on by default buries everything.
    expect(shouldLog(true, undefined, none)).toBe(false)
  })

  it('is never on in production, whatever the flags say', () => {
    expect(shouldLog(false, 'true', stored('1'))).toBe(false)
  })

  it('turns on with the env flag', () => {
    expect(shouldLog(true, 'true', none)).toBe(true)
    expect(shouldLog(true, '1', none)).toBe(true)
  })

  it('turns on with the localStorage flag, no restart needed', () => {
    expect(shouldLog(true, undefined, stored('1'))).toBe(true)
    expect(shouldLog(true, undefined, stored('true'))).toBe(true)
  })

  it('ignores other values rather than treating them as truthy', () => {
    expect(shouldLog(true, 'false', stored('0'))).toBe(false)
    expect(shouldLog(true, undefined, stored('yes'))).toBe(false)
  })

  it('survives storage that throws, as in private browsing', () => {
    const throws = () => { throw new Error('denied') }
    expect(shouldLog(true, undefined, throws)).toBe(false)
  })
})
