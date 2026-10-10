import { describe, expect, it } from 'vitest'
import { wantsToggle, shouldAutoOpenApp } from '../../src/main/agent/background-mode.js'
import {
  resolveAppBehavior,
  applyAppBehaviorPatch,
  DEFAULT_APP_BEHAVIOR
} from '../../src/main/agent/app-prefs.js'

describe('background-mode', () => {
  it('routes --toggle through the single-instance lock', () => {
    expect(wantsToggle(['palette', '--toggle'])).toBe(true)
    expect(wantsToggle(['palette --toggle'])).toBe(true)
    expect(wantsToggle(['palette'])).toBe(false)
  })

  it('opens the app by default and stays tray-only only with --background', () => {
    expect(shouldAutoOpenApp(['palette'])).toBe(true)
    expect(shouldAutoOpenApp(['palette', '--background'])).toBe(false)
    expect(shouldAutoOpenApp(['palette', '--toggle'])).toBe(true)
    expect(shouldAutoOpenApp(['palette', '--calendar'])).toBe(true)
  })
})

describe('app-prefs', () => {
  it('defaults to keeping the command bar in the background', () => {
    expect(DEFAULT_APP_BEHAVIOR).toEqual({ keepBackground: true, shader: true })
    expect(resolveAppBehavior(undefined)).toEqual({ keepBackground: true, shader: true })
    expect(resolveAppBehavior({ keepBackground: false })).toEqual({ keepBackground: false, shader: true })
  })

  it('falls back to defaults on garbage', () => {
    expect(resolveAppBehavior(null)).toEqual({ keepBackground: true, shader: true })
    expect(resolveAppBehavior({ keepBackground: 'yes' })).toEqual({ keepBackground: true, shader: true })
  })

  it('merges appearance patches without dropping keepBackground', () => {
    const next = applyAppBehaviorPatch({ keepBackground: false, shader: true }, { shader: false })
    expect(next).toEqual({ keepBackground: false, shader: false })
    expect(applyAppBehaviorPatch({ keepBackground: true, shader: true }, {})).toBeNull()
  })
})
