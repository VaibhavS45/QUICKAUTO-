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
    expect(DEFAULT_APP_BEHAVIOR).toEqual({ keepBackground: true, shader: true, theme: 'system' })
    expect(resolveAppBehavior(undefined)).toEqual({ keepBackground: true, shader: true, theme: 'system' })
    expect(resolveAppBehavior({ keepBackground: false })).toEqual({ keepBackground: false, shader: true, theme: 'system' })
  })

  it('falls back to defaults on garbage', () => {
    expect(resolveAppBehavior(null)).toEqual({ keepBackground: true, shader: true, theme: 'system' })
    expect(resolveAppBehavior({ keepBackground: 'yes' })).toEqual({ keepBackground: true, shader: true, theme: 'system' })
    expect(resolveAppBehavior({ theme: 'neon' })).toEqual({ keepBackground: true, shader: true, theme: 'system' })
  })

  it('merges appearance patches without dropping keepBackground', () => {
    const next = applyAppBehaviorPatch({ keepBackground: false, shader: true, theme: 'system' }, { shader: false })
    expect(next).toEqual({ keepBackground: false, shader: false, theme: 'system' })
    expect(applyAppBehaviorPatch({ keepBackground: true, shader: true, theme: 'system' }, {})).toBeNull()
  })

  it('merges theme patches for day/night mode', () => {
    const next = applyAppBehaviorPatch({ keepBackground: true, shader: true, theme: 'system' }, { theme: 'light' })
    expect(next).toEqual({ keepBackground: true, shader: true, theme: 'light' })
    expect(applyAppBehaviorPatch({ keepBackground: true, shader: true, theme: 'light' }, { theme: 'nope' })).toBeNull()
  })
})
