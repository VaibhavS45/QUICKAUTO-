import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { HomeView } from '../../src/renderer/shell/HomeView.js'
import { START_OPTIONS } from '../../src/renderer/features/automations/schedule/start-choice.js'
import { createFeatureProps } from '../../src/renderer/shell/FeatureHost.js'

const shell = {
  navigate: vi.fn(),
  openCalendarWindow: () => {},
  openSettings: vi.fn(),
  notify: vi.fn(),
  updatesList: async () => ({ ok: true, logs: [], nextCursor: undefined }),
  updatesStream: async () => ({ ok: true }),
  onUpdatesChanged: () => () => {},
  getRunLog: async () => ({ ok: true, log: undefined })
}

describe('home view', () => {
  it('shows the start panel with updates and no chat bar', () => {
    const html = renderToStaticMarkup(createElement(HomeView, { shell }))
    expect(html).toContain('Automate your work')
    // The panel leads with the choices; the label lives only in the create dialog.
    expect(html).not.toContain('Choose how it starts')
    for (const opt of START_OPTIONS) expect(html).toContain(opt.title)
    expect(html).toContain('No updates yet')
    expect(html).not.toContain('<textarea')
  })

  it('opens the create flow from the route, as a dialog without a breadcrumb', () => {
    const choice = renderToStaticMarkup(createElement(HomeView, { shell, params: { startKind: 'choice' } }))
    expect(choice).toContain('Choose how it starts')
    expect(choice).not.toContain('aria-label="Breadcrumb"')
    const builder = renderToStaticMarkup(createElement(HomeView, { shell, params: { startKind: 'schedule' } }))
    expect(builder).toContain('Palette will')
    expect(builder).not.toContain('aria-label="Breadcrumb"')
    const home = renderToStaticMarkup(createElement(HomeView, { shell }))
    expect(home).not.toContain('Palette will')
  })

  it('opens the schedule and the trigger as separate forms', () => {
    const schedule = renderToStaticMarkup(createElement(HomeView, { shell, params: { startKind: 'schedule' } }))
    expect(schedule).toContain('AM 9:00')
    expect(schedule).not.toContain('Add Trigger')
    const triggered = renderToStaticMarkup(createElement(HomeView, { shell, params: { startKind: 'triggered' } }))
    expect(triggered).toContain('+ Add Trigger')
    expect(triggered).not.toContain('AM 9:00')
  })
})

describe('start deep link', () => {
  it('passes startKind through to the automations feature', () => {
    const props = createFeatureProps(shell, { startKind: 'schedule' })
    expect(props.initialStartKind).toBe('schedule')
  })
})
