import { describe, expect, it } from 'vitest'
import { wantsToggle, shouldAutoOpenCalendar } from '../../src/main/agent/background-mode.js'
import { resolveAppBehavior, DEFAULT_APP_BEHAVIOR } from '../../src/main/agent/app-prefs.js'

describe('background-mode', () => {
  it('routes --toggle through the single-instance lock', () => {
    expect(wantsToggle(['palette', '--toggle'])).toBe(true)
    expect(wantsToggle(['palette --toggle'])).toBe(true)
    expect(wantsToggle(['palette'])).toBe(false)
  })

  it('opens the calendar first unless started tray-only', () => {
    expect(shouldAutoOpenCalendar(['palette'])).toBe(true)
    expect(shouldAutoOpenCalendar(['palette', '--calendar'])).toBe(true)
    expect(shouldAutoOpenCalendar(['palette', '--toggle'])).toBe(false)
  })
})

describe('app-prefs', () => {
  it('defaults to keeping the command bar in the background', () => {
    expect(DEFAULT_APP_BEHAVIOR.keepBackground).toBe(true)
    expect(resolveAppBehavior(undefined)).toEqual({ keepBackground: true })
    expect(resolveAppBehavior({ keepBackground: false })).toEqual({ keepBackground: false })
  })

  it('falls back to defaults on garbage', () => {
    expect(resolveAppBehavior(null)).toEqual({ keepBackground: true })
    expect(resolveAppBehavior({ keepBackground: 'yes' })).toEqual({ keepBackground: true })
  })
})
