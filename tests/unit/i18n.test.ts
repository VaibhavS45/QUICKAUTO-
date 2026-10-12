import { describe, expect, it, vi, afterEach } from 'vitest'
import { resolveUiLanguage, translate, uiKeys, UI_LANGS } from '../../src/renderer/i18n/strings.js'
import { isSupportedLanguage, SUPPORTED_LANGUAGES } from '../../src/renderer/settings/languages.js'
import { ProfileLanguageSchema } from '../../src/main/agent/profile-settings.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('i18n strings', () => {
  it('has a non-empty English source for every key', () => {
    const keys = uiKeys()
    expect(keys.length).toBeGreaterThan(50)
    for (const key of keys) {
      expect(translate('en', key)).not.toBe(key)
    }
  })

  it('falls back to English for missing translations, never to the key', () => {
    for (const lang of UI_LANGS) {
      for (const key of uiKeys()) {
        const hit = translate(lang, key)
        expect(typeof hit).toBe('string')
        expect(hit.length).toBeGreaterThan(0)
        expect(hit).not.toBe(key)
      }
    }
  })

  it('actually translates core chrome (not English) in every language', () => {
    for (const lang of UI_LANGS) {
      if (lang === 'en') continue
      expect(translate(lang, 'settings.title')).not.toBe(translate('en', 'settings.title'))
      expect(translate(lang, 'shell.markAllRead')).not.toBe(translate('en', 'shell.markAllRead'))
    }
  })

  it('resolves system to the OS locale when supported, else English', () => {
    vi.stubGlobal('navigator', { language: 'fr-FR' })
    expect(resolveUiLanguage('system')).toBe('fr')
    vi.stubGlobal('navigator', { language: 'pt-BR' })
    expect(resolveUiLanguage('system')).toBe('pt')
    vi.stubGlobal('navigator', { language: 'xx-YY' })
    expect(resolveUiLanguage('system')).toBe('en')
  })

  it('passes explicit preferences through and defaults garbage to English', () => {
    expect(resolveUiLanguage('ja')).toBe('ja')
    expect(resolveUiLanguage('en')).toBe('en')
    vi.stubGlobal('navigator', undefined)
    expect(resolveUiLanguage('system')).toBe('en')
    expect(resolveUiLanguage('xx')).toBe('en')
  })

  it('stays in sync with the saved profile language codes', () => {
    for (const entry of SUPPORTED_LANGUAGES) {
      expect(ProfileLanguageSchema.safeParse(entry.value).success).toBe(true)
      expect(isSupportedLanguage(entry.value)).toBe(true)
      // Every non-system language has a UI dictionary (system resolves via locale).
      if (entry.value !== 'system') {
        expect(UI_LANGS).toContain(entry.value)
      }
    }
  })
})
