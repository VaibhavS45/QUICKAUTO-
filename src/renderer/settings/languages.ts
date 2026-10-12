/**
 * Language options for Settings > Appearance. Values must stay in sync with
 * `ProfileLanguageSchema` in src/main/agent/profile-settings.ts.
 */

export const SUPPORTED_LANGUAGES = [
  { value: 'system', label: 'System', hint: 'Follow the OS language' },
  { value: 'en', label: 'English', hint: '' },
  { value: 'es', label: 'Español', hint: 'Spanish' },
  { value: 'fr', label: 'Français', hint: 'French' },
  { value: 'de', label: 'Deutsch', hint: 'German' },
  { value: 'hi', label: 'हिन्दी', hint: 'Hindi' },
  { value: 'pt', label: 'Português', hint: 'Portuguese' },
  { value: 'ja', label: '日本語', hint: 'Japanese' },
  { value: 'zh', label: '中文', hint: 'Chinese' }
] as const

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]['value']

export function isSupportedLanguage(value: unknown): value is SupportedLanguage {
  return SUPPORTED_LANGUAGES.some((entry) => entry.value === value)
}
