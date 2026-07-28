import { describe, it, expect, beforeEach } from 'vitest'
import { loadSource, saveSource, DEFAULT_SOURCE } from './source'

describe('stored source', () => {
  beforeEach(() => localStorage.clear())

  it('defaults to spotify, so nothing changes for existing users', () => {
    expect(DEFAULT_SOURCE).toBe('spotify')
    expect(loadSource()).toBe('spotify')
  })

  it('round-trips a choice', () => {
    saveSource('audius')
    expect(loadSource()).toBe('audius')
    saveSource('spotify')
    expect(loadSource()).toBe('spotify')
  })

  it('falls back to the default for anything unrecognised', () => {
    localStorage.setItem('hb_source', 'napster')
    expect(loadSource()).toBe('spotify')
  })
})
