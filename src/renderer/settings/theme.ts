/**
 * Day/night appearance theme. 'light' is day mode, 'dark' is night mode,
 * 'system' follows the OS preference. Pure + unit-tested; DOM side-effects
 * live in `applyTheme` below.
 */

export const APP_THEMES = [
  { value: 'light', label: 'Day', hint: 'Bright, light background' },
  { value: 'dark', label: 'Night', hint: 'Dim, dark background' },
  { value: 'system', label: 'System', hint: 'Follow the OS setting' }
] as const

export type AppThemeValue = (typeof APP_THEMES)[number]['value']

export function isAppTheme(value: unknown): value is AppThemeValue {
  return value === 'light' || value === 'dark' || value === 'system'
}

/** Resolve 'system' via matchMedia; unknown values fall back to dark (night). */
export function resolveTheme(theme: unknown, prefersLight: boolean): 'light' | 'dark' {
  if (theme === 'light') return 'light'
  if (theme === 'dark') return 'dark'
  if (theme === 'system') return prefersLight ? 'light' : 'dark'
  return 'dark'
}

/** Apply the theme to the document. Safe to call when `document` is missing (SSR/tests). */
export function applyTheme(theme: unknown): 'light' | 'dark' {
  const prefersLight =
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-color-scheme: light)').matches
      : false
  const resolved = resolveTheme(theme, prefersLight)
  if (typeof document !== 'undefined') {
    const root = document.documentElement
    root.classList.toggle('light', resolved === 'light')
    root.classList.toggle('dark', resolved === 'dark')
    root.dataset['theme'] = resolved
    root.style.colorScheme = resolved
  }
  return resolved
}
