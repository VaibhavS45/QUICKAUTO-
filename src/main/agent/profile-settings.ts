import { z } from 'zod'

/**
 * General profile settings (Settings dialog, General tab).
 * Non-secret by design: safe to send to the renderer. Stored in
 * electron-store alongside model settings. No polling, no external calls.
 */

export const ProfileLanguageSchema = z.enum(['system', 'en'])
export type ProfileLanguage = z.infer<typeof ProfileLanguageSchema>

export const ProfileSettingsSchema = z.object({
  name: z.string().max(80),
  email: z.string().max(254).refine((v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email.'),
  about: z.string().max(2000),
  language: ProfileLanguageSchema
})

const ProfileSettingsInputSchema = z.object({
  name: z.string(),
  email: z.string().refine((v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Invalid email.'),
  about: z.string(),
  language: ProfileLanguageSchema
})
export type ProfileSettings = z.infer<typeof ProfileSettingsSchema>

export const DEFAULT_PROFILE_SETTINGS: ProfileSettings = {
  name: '',
  email: '',
  about: '',
  language: 'system'
}

export interface ProfileStore {
  get(key: string): unknown
  set(key: string, value: unknown): void
}

const PROFILE_KEY = 'general-profile'

export class ProfileSettingsService {
  constructor(private readonly store: ProfileStore) {}

  get(): ProfileSettings {
    const parsed = ProfileSettingsSchema.safeParse(this.store.get(PROFILE_KEY))
    if (!parsed.success) return { ...DEFAULT_PROFILE_SETTINGS }
    return parsed.data
  }

  set(input: unknown): ProfileSettings {
    const parsed = ProfileSettingsInputSchema.safeParse(input)
    if (!parsed.success) throw new Error('Invalid profile settings.')
    const trimmed: ProfileSettings = {
      name: parsed.data.name.trim().slice(0, 80),
      email: parsed.data.email.trim().slice(0, 254),
      about: parsed.data.about.slice(0, 2000),
      language: parsed.data.language
    }
    const recheck = ProfileSettingsSchema.safeParse(trimmed)
    if (!recheck.success) throw new Error('Invalid profile settings.')
    this.store.set(PROFILE_KEY, recheck.data)
    return recheck.data
  }
}
