import { describe, expect, it } from 'vitest'
import { buildEngines } from '../../src/renderer/settings/engines.js'
import { buildConnectorRows } from '../../src/renderer/settings/connectors.js'
import { SETTINGS_NAV } from '../../src/renderer/settings/nav.js'

describe('settings sidebar', () => {
  it('has one AI group with Agents + Connectors (no Provider/API duplicates)', () => {
    const ai = SETTINGS_NAV.filter((n) => n.group === 'ai').map((n) => n.id)
    expect(ai).toEqual(['agents', 'connectors'])
  })
})

describe('buildEngines', () => {
  it('offers OpenCode only and moves it to needs-setup when missing', () => {
    const installed = buildEngines({
      active: 'opencode',
      harnesses: [{ id: 'opencode', installed: true, version: '2.0.20' }]
    })
    expect(installed.ready.map((e) => e.id)).toEqual(['opencode'])
    expect(installed.needsSetup).toEqual([])
    expect(installed.active).toBe('opencode')
    expect(installed.ready[0]?.version).toBe('2.0.20')

    const missing = buildEngines({ active: 'opencode', harnesses: [{ id: 'opencode', installed: false }] })
    expect(missing.ready).toEqual([])
    expect(missing.needsSetup.map((e) => e.id)).toEqual(['opencode'])
    expect(missing.needsSetup[0]?.hint).toContain('opencode.ai')
  })
})

describe('buildConnectorRows', () => {
  it('maps live statuses to rows with the right actions', () => {
    const rows = buildConnectorRows({
      configured: false,
      services: [
        { id: 'notion', connected: false },
        { id: 'sheets', connected: false },
        { id: 'websearch', connected: true }
      ],
      gmailConnected: false,
      ghInstalled: true,
      ghAuthenticated: false,
      ghDetail: 'gh found but not logged in.'
    })
    expect(rows.map((r) => r.id)).toEqual(['gmail', 'github', 'notion', 'sheets', 'websearch'])
    expect(rows.find((r) => r.id === 'gmail')?.action).toBe('connect-gmail')
    expect(rows.find((r) => r.id === 'github')?.status).toBe('action')
    expect(rows.find((r) => r.id === 'notion')?.action).toBe('composio-key')
    expect(rows.find((r) => r.id === 'websearch')?.status).toBe('connected')
  })
})
