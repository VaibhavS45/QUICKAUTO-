import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ShellApp from '../../src/renderer/shell/ShellApp.js'
import { createFeatureProps } from '../../src/renderer/shell/FeatureHost.js'
import { AUTOMATION_TABS, PRIMARY_NAV, parseAutomationCreate, parseAutomationTab, splitNav } from '../../src/renderer/shell/nav.js'
import type { ShellApi } from '../../src/renderer/contracts/feature.js'

const shell: ShellApi = {
  navigate: () => {},
  openCalendarWindow: () => {},
  openSettings: () => {},
  notify: () => {},
  updatesList: async () => ({ ok: true, logs: [], nextCursor: undefined }),
  updatesStream: async () => ({ ok: true }),
  onUpdatesChanged: () => () => {},
  getRunLog: async () => ({ ok: true, log: undefined })
}

describe('top bar nav', () => {
  it('replaces the sidebar rail and the command palette', () => {
    const html = renderToStaticMarkup(createElement(ShellApp))
    expect(html).toContain('class="shell-frame"')
    expect(html).toContain('shell-topnav')
    expect(html).not.toContain('shell-sidebar')
    expect(html).not.toContain('shell-palette')
    expect(html).toContain('Open profile menu')
  })

  it('splits the active view into the orange slot outside the pill', () => {
    const html = renderToStaticMarkup(createElement(ShellApp))
    expect(html).toContain('shell-topnav-item is-active')
    expect(html).toContain('aria-current="page"')
    // The default route is Automate, so it is the one that splits out.
    expect(html).toContain('title="Automate"')
    for (const tab of AUTOMATION_TABS) expect(html).toContain(`title="${tab.label}"`)
  })

  it('splits the pill either side of the active view, which keeps its slot', () => {
    const html = renderToStaticMarkup(createElement(ShellApp))
    // Automate is the first view: orange leads, one group of the rest follows.
    expect(html.indexOf('is-active')).toBeLessThan(html.indexOf('shell-topnav-group"'))
    // Only one active slot, and it is a sibling of the group, not inside it.
    expect(html.match(/shell-topnav-item is-active/g)).toHaveLength(1)
    expect(html).not.toMatch(/shell-topnav-group[^>]*>[^<]*<button[^>]*is-active/)
    // Every view still renders, in nav order.
    const order = [...html.matchAll(/title="([^"]+)"/g)]
      .map((m) => m[1])
      .filter((label) => ['Automate', 'Updates', 'Manage', 'Canvas'].includes(label))
    expect(order).toEqual(['Automate', 'Updates', 'Manage', 'Canvas'])
  })

  it('splits the pill on both sides for a middle view, keeping its slot', () => {
    const ids = [...PRIMARY_NAV, ...AUTOMATION_TABS].map((item) => item.id)
    const segmentIds = (items: { id: string }[]): string[] => items.map((item) => item.id)
    const items = ids.map((id) => ({ id }))
    for (const id of ids) {
      const { before, after } = splitNav(items, id)
      // Order preserved, active absent from both sides, nothing lost.
      expect([...segmentIds(before), id, ...segmentIds(after)]).toEqual(ids)
      expect(segmentIds(before)).not.toContain(id)
      expect(segmentIds(after)).not.toContain(id)
    }
    // A middle id really does produce two segments.
    expect(segmentIds(splitNav(items, 'manage').before)).toEqual(['home', 'updates'])
    expect(segmentIds(splitNav(items, 'manage').after)).toEqual(['canvas'])
    expect(splitNav(items, 'home').before).toEqual([])
    expect(segmentIds(splitNav(items, 'home').after)).toEqual(['updates', 'manage', 'canvas'])
    // Unknown id falls back to a single trailing group.
    expect(segmentIds(splitNav(items, 'nope').after)).toEqual(ids)
  })

  it('deep-links to each automation tab', () => {
    expect(parseAutomationTab('canvas')).toBe('canvas')
    expect(parseAutomationTab('nope')).toBe(undefined)
    expect(createFeatureProps(shell, { automationTab: 'updates' }).initialAutomationTab).toBe('updates')
  })

  it('parses the create-flow steps carried by the route', () => {
    expect(parseAutomationCreate('choice')).toBe('choice')
    expect(parseAutomationCreate('schedule')).toBe('schedule')
    expect(parseAutomationCreate('triggered')).toBe('triggered')
    expect(parseAutomationCreate('advanced')).toBe('advanced')
    expect(parseAutomationCreate('nope')).toBe(undefined)
  })
})
