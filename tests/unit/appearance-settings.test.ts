import { describe, expect, it } from 'vitest'
import { ProfileLanguageSchema } from '../../src/main/agent/profile-settings.js'
import { APP_THEMES, isAppTheme, resolveTheme } from '../../src/renderer/settings/theme.js'
import { SUPPORTED_LANGUAGES, isSupportedLanguage } from '../../src/renderer/settings/languages.js'
import { APP_SHORTCUTS } from '../../src/renderer/settings/shortcuts.js'
import { filterSettingsNav } from '../../src/renderer/settings/nav.js'

describe('appearance settings model', () => {
  it('offers day, night, and system themes', () => {
    expect(APP_THEMES.map((t) => t.value)).toEqual(['light', 'dark', 'system'])
    expect(isAppTheme('light')).toBe(true)
    expect(isAppTheme('dark')).toBe(true)
    expect(isAppTheme('system')).toBe(true)
    expect(isAppTheme('neon')).toBe(false)
  })

  it('resolves system theme from the OS preference and falls back to night', () => {
    expect(resolveTheme('light', false)).toBe('light')
    expect(resolveTheme('dark', true)).toBe('dark')
    expect(resolveTheme('system', true)).toBe('light')
    expect(resolveTheme('system', false)).toBe('dark')
    expect(resolveTheme('garbage', false)).toBe('dark')
  })

  it('keeps language options in sync with the profile schema', () => {
    for (const entry of SUPPORTED_LANGUAGES) {
      expect(ProfileLanguageSchema.safeParse(entry.value).success).toBe(true)
      expect(isSupportedLanguage(entry.value)).toBe(true)
    }
    expect(SUPPORTED_LANGUAGES.length).toBeGreaterThan(2)
    expect(isSupportedLanguage('xx')).toBe(false)
  })

  it('lists shortcuts for opening, closing, and navigating', () => {
    expect(APP_SHORTCUTS.length).toBeGreaterThanOrEqual(3)
    const actions = APP_SHORTCUTS.map((s) => s.action).join(' ')
    expect(actions).toMatch(/settings/i)
    expect(actions).toMatch(/close/i)
    for (const shortcut of APP_SHORTCUTS) {
      expect(shortcut.keys.length).toBeGreaterThan(0)
    }
  })

  it('finds the new panels through settings search', () => {
    expect(filterSettingsNav('shortcut').map((n) => n.id)).toContain('general')
    expect(filterSettingsNav('night').map((n) => n.id)).toContain('appearance')
    expect(filterSettingsNav('language').map((n) => n.id)).toContain('appearance')
  })
})
