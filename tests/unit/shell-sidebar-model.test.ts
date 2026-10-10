import { describe, expect, it } from 'vitest'
import { SIDEBAR_NAV_ITEMS, SIDEBAR_SECTIONS } from '../../src/renderer/shell/sidebar-model.js'

describe('shell sidebar model', () => {
  it('contains only the requested primary navigation entries', () => {
    expect(SIDEBAR_NAV_ITEMS.map(({ label }) => label)).toEqual(['New chat', 'Automations', 'Plugins'])
    expect(SIDEBAR_SECTIONS).toEqual(["Today's schedule", 'Recent tasks', 'Chats'])
  })

  it('does not include removed sidebar destinations', () => {
    const forbidden = ['Computers', 'Agents', 'Library', 'Creations', 'Projects', 'More']
    const visibleLabels = [...SIDEBAR_NAV_ITEMS.map(({ label }) => label), ...SIDEBAR_SECTIONS]
    expect(visibleLabels).not.toEqual(expect.arrayContaining(forbidden))
  })
})
