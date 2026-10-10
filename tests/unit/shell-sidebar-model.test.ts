import { describe, expect, it } from 'vitest'
import { FORBIDDEN_LABELS, PRIMARY_NAV, SIDEBAR_SECTIONS } from '../../src/renderer/shell/nav.js'

describe('shell sidebar model', () => {
  it('contains only the requested navigation and section labels', () => {
    const labels = [...PRIMARY_NAV.map(({ label }) => label), ...SIDEBAR_SECTIONS]
    expect(labels).toEqual(['New chat', 'Automations', 'Plugins', "Today's schedule", 'Recent tasks', 'Chats'])
    for (const label of FORBIDDEN_LABELS) expect(labels).not.toContain(label)
  })
})
