import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { HomeView } from '../../src/renderer/shell/HomeView.js'
import { START_OPTIONS } from '../../src/renderer/features/automations/start-choice.js'
import { createFeatureProps } from '../../src/renderer/shell/FeatureHost.js'

const shell = {
  navigate: vi.fn(),
  openCalendarWindow: () => {},
  openSettings: vi.fn(),
  notify: vi.fn()
}

describe('home view', () => {
  it('shows the start panel with updates and no chat bar', () => {
    const html = renderToStaticMarkup(createElement(HomeView, { shell }))
    expect(html).toContain('Automate your work')
    expect(html).toContain('Choose how it starts')
    for (const opt of START_OPTIONS) expect(html).toContain(opt.title)
    expect(html).toContain('No updates yet')
    expect(html).not.toContain('<textarea')
  })
})

describe('start deep link', () => {
  it('passes startKind through to the automations feature', () => {
    const props = createFeatureProps(shell, { startKind: 'schedule' })
    expect(props.initialStartKind).toBe('schedule')
  })
})
