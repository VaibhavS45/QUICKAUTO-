import { describe, expect, it } from 'vitest'
import { ProfileSettingsService, DEFAULT_PROFILE_SETTINGS } from '../../src/main/agent/profile-settings.js'
import { filterSettingsNav, groupedSettingsNav, SETTINGS_NAV } from '../../src/renderer/settings/nav.js'

function memStore(seed?: unknown) {
  const m = new Map<string, unknown>()
  if (seed !== undefined) m.set('general-profile', seed)
  return {
    get: (k: string) => m.get(k),
    set: (k: string, v: unknown) => {
      m.set(k, v)
    }
  }
}

describe('ProfileSettingsService', () => {
  it('returns defaults on empty/corrupt store', () => {
    expect(new ProfileSettingsService(memStore()).get()).toEqual(DEFAULT_PROFILE_SETTINGS)
    expect(new ProfileSettingsService(memStore({ nope: 1 })).get()).toEqual(DEFAULT_PROFILE_SETTINGS)
  })

  it('saves and trims; rejects bad email/language', () => {
    const svc = new ProfileSettingsService(memStore())
    const saved = svc.set({ name: '  Yash  ', email: 'a@b.co', about: 'hi', language: 'system' })
    expect(saved.name).toBe('Yash')
    expect(svc.get().email).toBe('a@b.co')
    expect(() => svc.set({ name: '', email: 'not-an-email', about: '', language: 'system' })).toThrow()
    expect(() => svc.set({ name: '', email: '', about: '', language: 'xx' })).toThrow()
  })

  it('allows empty email (unset) and caps lengths', () => {
    const svc = new ProfileSettingsService(memStore())
    const saved = svc.set({ name: 'x'.repeat(200), email: '', about: 'y'.repeat(5000), language: 'en' })
    expect(saved.name.length).toBeLessThanOrEqual(80)
    expect(saved.about.length).toBeLessThanOrEqual(2000)
  })
})

describe('filterSettingsNav', () => {
  it('returns all on empty query, filters case-insensitively', () => {
    expect(filterSettingsNav('').length).toBe(SETTINGS_NAV.length)
    expect(filterSettingsNav('gen').map((n) => n.id)).toEqual(['general'])
    expect(filterSettingsNav('MODEL').map((n) => n.id)).toEqual(['provider'])
    expect(filterSettingsNav('shader').map((n) => n.id)).toEqual(['appearance'])
    expect(filterSettingsNav('zzz')).toEqual([])
  })

  it('groups remaining items and drops empty groups', () => {
    const groups = groupedSettingsNav(filterSettingsNav('hotkey'))
    expect(groups).toEqual([{ id: 'system', label: 'System', items: [expect.objectContaining({ id: 'shortcuts' })] }])
  })
})
