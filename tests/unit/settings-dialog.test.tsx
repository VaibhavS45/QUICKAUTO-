import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import SettingsApp from '../../src/renderer/settings/SettingsDialog.js'

function renderTab(tab: string): string {
  return renderToStaticMarkup(createElement(SettingsApp, { initialTab: tab }))
}

describe('settings dialog pages', () => {
  it('renders usable General settings for language and close behavior', () => {
    const markup = renderTab('general')
    expect(markup).toContain('Language')
    expect(markup).toContain('When the app window is closed')
    expect(markup).toContain('Keep app in background')
  })

  it('renders Appearance with a clear animated/static preview and control', () => {
    const markup = renderTab('appearance')
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
