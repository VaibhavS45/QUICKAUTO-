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
  it('splits ready vs needs-setup and keeps the active engine', () => {
    const { ready, needsSetup, active } = buildEngines({
      active: 'opencode',
      harnesses: [
        { id: 'opencode', installed: true, version: '2.0.20' },
        { id: 'pi', installed: false }
      ],
      model: 'claude-sonnet-4-5',
      keySet: false
    })
    expect(ready.map((e) => e.id)).toEqual(['opencode'])
    expect(needsSetup.map((e) => e.id)).toEqual(['builtin', 'pi'])
    expect(active).toBe('opencode')
    expect(ready[0]?.version).toBe('2.0.20')
    expect(needsSetup[0]?.hint).toMatch(/API key/)
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
