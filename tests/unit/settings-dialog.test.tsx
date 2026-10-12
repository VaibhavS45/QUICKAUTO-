import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import SettingsApp from '../../src/renderer/settings/SettingsDialog.js'

function renderTab(tab: string): string {
  return renderToStaticMarkup(createElement(SettingsApp, { initialTab: tab }))
}

describe('settings dialog pages', () => {
  it('renders General with stay-in-background toggle and keyboard shortcuts, without language', () => {
    const markup = renderTab('general')
    expect(markup).toContain('Stay on in background')
    expect(markup).toContain('scheduled routines')
    expect(markup).toContain('Keyboard shortcuts')
    expect(markup).toContain('command palette')
    expect(markup).not.toContain('aria-label="Language"')
  })

  it('renders Appearance with day/night mode, languages, and animated background control', () => {
    const markup = renderTab('appearance')
    expect(markup).toContain('Mode')
    expect(markup).toContain('Day')
    expect(markup).toContain('Night')
    expect(markup).toContain('Language')
    expect(markup).toContain('Espa')
    expect(markup).toContain('Animated color wash')
    expect(markup).toContain('Animated background')
    expect(markup).toContain('lower GPU use on battery')
  })

  it('keeps Account profile page intact', () => {
    const markup = renderTab('account')
    expect(markup).toContain('Profile')
    expect(markup).toContain('About me')
  })
})
