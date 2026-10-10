import { describe, expect, it } from 'vitest'
import { shouldAutoOpenApp, wantsBackground } from '../../src/main/shell/launch-policy.js'
import {
  resolveAppBehavior,
  applyAppBehaviorPatch,
  DEFAULT_APP_BEHAVIOR
} from '../../src/main/shell/app-prefs.js'

describe('launch policy', () => {
  it('opens the app by default and only stays in the background when requested', () => {
    expect(shouldAutoOpenApp(['app'])).toBe(true)
    expect(shouldAutoOpenApp(['app', '--background'])).toBe(false)
    expect(wantsBackground(['--background'])).toBe(true)
  })
})

describe('app-prefs', () => {
  it('defaults to keeping the app in the background after its window closes', () => {
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
