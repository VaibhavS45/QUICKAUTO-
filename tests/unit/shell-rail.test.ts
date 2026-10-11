import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import ShellApp from '../../src/renderer/shell/ShellApp.js'
import { createFeatureProps } from '../../src/renderer/shell/FeatureHost.js'
import { AUTOMATION_TABS, parseAutomationTab } from '../../src/renderer/shell/nav.js'
import type { ShellApi } from '../../src/renderer/contracts/feature.js'

const shell: ShellApi = {
  navigate: () => {},
  openCalendarWindow: () => {},
  openSettings: () => {},
  notify: () => {}
}

describe('sidebar rail', () => {
  it('is always a thin icon rail with settings on the avatar', () => {
    const html = renderToStaticMarkup(createElement(ShellApp))
    expect(html).toContain('shell-frame is-collapsed')
    expect(html).toContain('title="New chat"')
    expect(html).toContain('title="Automations"')
    expect(html).toContain('Account menu for Local profile')
    expect(html).not.toContain('Expand sidebar')
    expect(html).not.toContain('Collapse sidebar')
    expect(html).not.toContain('Account settings')
    expect(html).not.toContain('shell-chat-list')
    expect(html).not.toContain('shell-profile-name')
  })

  it('centers automation tab icons that deep-link to each tab', () => {
    const html = renderToStaticMarkup(createElement(ShellApp))
    expect(html).toContain('aria-label="Automation views"')
    for (const tab of AUTOMATION_TABS) expect(html).toContain(`title="${tab.label}"`)
    expect(parseAutomationTab('canvas')).toBe('canvas')
    expect(parseAutomationTab('nope')).toBe(undefined)
    expect(createFeatureProps(shell, { automationTab: 'updates' }).initialAutomationTab).toBe('updates')
  })
})
