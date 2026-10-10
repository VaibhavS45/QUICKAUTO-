import { describe, expect, it } from 'vitest'
import { SettingsTabRequestSchema } from '../../src/main/ipc.js'
import { EXTRA_NAV, EXTRA_TABS } from '../../src/renderer/settings/extra-tabs.js'
import { createSettingsNav, isSettingsTabRegistered, SETTINGS_NAV } from '../../src/renderer/settings/nav.js'

describe('shell settings extension hooks', () => {
  it('validates optional tab requests and rejects malformed payloads', () => {
    expect(SettingsTabRequestSchema.safeParse(undefined).success).toBe(true)
    expect(SettingsTabRequestSchema.safeParse({ tab: 'account' }).success).toBe(true)
    expect(SettingsTabRequestSchema.safeParse({ tab: '../outside' }).success).toBe(false)
    expect(SettingsTabRequestSchema.safeParse({ tab: 'account', extra: true }).success).toBe(false)
  })

  it('accepts tabs supplied through the extension navigation model', () => {
    const nav = createSettingsNav([
      { id: 'account', label: 'Account', group: 'app', keywords: ['profile'] }
    ])
    expect(isSettingsTabRegistered('account', nav)).toBe(true)
    expect(nav.find((item) => item.id === 'account')?.label).toBe('Account')
    expect(SETTINGS_NAV.length).toBeGreaterThan(0)
    expect(EXTRA_NAV.map((item) => item.id)).toEqual(['account', 'plugins', 'mcp', 'api', 'agents'])
    expect(Object.keys(EXTRA_TABS).sort()).toEqual(['agents', 'api', 'mcp', 'plugins'])
  })
})
