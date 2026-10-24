import { afterEach, describe, expect, it, vi } from 'vitest'
import { formatDateTime, formatAt, formatMonth, formatTime } from '../../src/renderer/lib/format.js'

describe('renderer time format helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('formats a timestamp with the navigator locale', () => {
    vi.stubGlobal('navigator', { language: 'en-US' } as Navigator)
    const at = new Date(2026, 9, 24, 9, 5).getTime()
    expect(formatTime(at)).toMatch(/9:05/)
    expect(formatDateTime(at)).toMatch(/Oct 24, 2026/)
    expect(formatAt(at)).toMatch(/^at 9:05/)
  })

  it('formats month labels through the locale', () => {
    vi.stubGlobal('navigator', { language: 'en-US' } as Navigator)
    expect(formatMonth(2026, 3)).toMatch(/Apr 2026/)
  })

  it('renders an em dash for invalid timestamps', () => {
    expect(formatTime(Number.NaN)).toBe('—')
    expect(formatDateTime(Number.NaN)).toBe('—')
  })
})
