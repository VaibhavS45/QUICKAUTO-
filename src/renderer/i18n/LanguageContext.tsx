import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { resolveUiLanguage, translate, type UiKey, type UiLang } from './strings.js'

interface LanguageContextValue {
  /** Saved preference code ('system', 'en', 'es', …). */
  preference: string
  /** Resolved concrete UI language ('en', 'es', …). */
  lang: UiLang
  t(key: UiKey): string
  /** Persist a new preference and apply it app-wide. Never throws. */
  setPreference(next: string): Promise<{ ok: boolean; error?: string }>
}

const defaultValue: LanguageContextValue = {
  preference: 'system',
  lang: 'en',
  t: (key) => translate('en', key),
  setPreference: () => Promise.resolve({ ok: false, error: 'No provider.' })
}

const LanguageContext = createContext<LanguageContextValue>(defaultValue)

export function useI18n(): LanguageContextValue {
  return useContext(LanguageContext)
}

/**
 * App-wide language provider. Loads the saved preference from the profile,
 * resolves 'system' via the OS locale, stamps <html lang>, and re-renders
 * every consumer when the preference changes (e.g. from Appearance).
 */
export function LanguageProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [preference, setPreferenceState] = useState('system')
  const lang = useMemo(() => resolveUiLanguage(preference), [preference])

  useEffect(() => {
    let live = true
    window.app
      .getProfile()
      .then((result) => {
        const profile = result as unknown as { language?: unknown }
        if (live && typeof profile.language === 'string') setPreferenceState(profile.language)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    if (typeof document !== 'undefined') document.documentElement.lang = lang
  }, [lang])

  const setPreference = useCallback(async (next: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      const current = (await window.app.getProfile()) as unknown as {
        name?: string
        email?: string
        about?: string
      }
      const saved = (await window.app.setProfile({
        name: current.name ?? '',
        email: current.email ?? '',
        about: current.about ?? '',
        language: next
      })) as unknown as { ok: boolean; error?: string }
      if (!saved.ok) return { ok: false, error: saved.error ?? 'Save failed.' }
      setPreferenceState(next)
      return { ok: true }
    } catch {
      return { ok: false, error: 'Save failed.' }
    }
  }, [])

  const t = useCallback((key: UiKey): string => translate(lang, key), [lang])

  const value = useMemo<LanguageContextValue>(
    () => ({ preference, lang, t, setPreference }),
    [preference, lang, t, setPreference]
  )
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}
