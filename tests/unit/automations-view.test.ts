import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { addDaysKey, dayLabel, localDayKey, monthGrid, monthLabel, pastDayLabel, routineOccursOn, routineTitle } from '../../src/renderer/features/automations/dates.js'
import AutomationsView, { CanvasLanding, UpdatesList, automationsTrail, stepsForRoutine } from '../../src/renderer/features/automations/AutomationsView.js'
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

vi.stubGlobal('window', {})

describe('automation date helpers', () => {
  it('builds local day keys and labels today/tomorrow', () => {
    const today = localDayKey(new Date(2026, 9, 10))
    expect(today).toBe('2026-10-10')
    expect(addDaysKey(today, 1)).toBe('2026-10-11')
    expect(dayLabel(today, today)).toBe('Today')
    expect(dayLabel('2026-10-11', today)).toBe('Tomorrow')
  })

  it('labels yesterday for the day before today', () => {
    expect(pastDayLabel('2026-10-09', '2026-10-10')).toBe('Yesterday')
    expect(pastDayLabel('2026-10-10', '2026-10-10')).toBe('Today')
  })

  it('truncates long prompts for card titles', () => {
    expect(routineTitle('short task')).toBe('short task')
    expect(routineTitle(`x${'y'.repeat(100)}`)).toMatch(/…$/)
  })

  it('builds a 6-week month grid with a short month label', () => {
    const cells = monthGrid(2026, 8)
    expect(cells).toHaveLength(42)
    expect(cells.some((c) => c.key === '2026-09-01')).toBe(true)
    expect(monthLabel(2026, 8)).toContain('2026')
  })

  it('matches daily routines to every day and one-shots to one day', () => {
    expect(routineOccursOn({ runAt: new Date(2026, 9, 10, 18, 30).getTime(), repeat: 'daily' }, '2026-10-25')).toBe(true)
    expect(routineOccursOn({ runAt: new Date(2026, 9, 10, 18, 30).getTime(), repeat: 'once' }, '2026-10-10')).toBe(true)
    expect(routineOccursOn({ runAt: new Date(2026, 9, 10, 18, 30).getTime(), repeat: 'once' }, '2026-10-11')).toBe(false)
  })

  it('matches weekday routines only on weekdays', () => {
    expect(routineOccursOn({ runAt: new Date(2026, 9, 9, 18, 30).getTime(), repeat: 'weekdays' }, '2026-10-12')).toBe(true)
    expect(routineOccursOn({ runAt: new Date(2026, 9, 9, 18, 30).getTime(), repeat: 'weekdays' }, '2026-10-11')).toBe(false)
  })
})

describe('AutomationsView', () => {
  it('renders the view toggle without an in-view tab bar (tabs live in the sidebar)', () => {
    const html = renderToStaticMarkup(createElement(AutomationsView, { shell }))
    expect(html).not.toContain('Automation sections')
    expect(html).toContain('Create')
  })

  it('updates tab shows the run feed only, without the section toolbar', () => {
    const html = renderToStaticMarkup(createElement(AutomationsView, { shell, initialAutomationTab: 'updates' }))
    expect(html).not.toContain('automations-toolbar')
    expect(html).not.toContain('aria-label="List"')
    expect(html).not.toContain('automations-view-toggle')
  })

  it('renders the Zap-style canvas chain', () => {
    const steps = stepsForRoutine(undefined)
    expect(steps.map((s) => s.title)).toContain('Trigger')
    expect(steps.map((s) => s.title)).toContain('Gmail')
  })

  it('keeps the create flow off the list page until Create is clicked', () => {
    const html = renderToStaticMarkup(createElement(AutomationsView, { shell }))
    expect(html).toContain('Create')
    expect(html).not.toContain('Back')
    expect(html).not.toContain('Choose how it starts')
    expect(html).not.toContain('agent will create it')
  })

  it('leaves the create flow to the Automate section', () => {
    // The create flow lives in the home view now, so Manage never shows it.
    const manage = renderToStaticMarkup(createElement(AutomationsView, { shell, initialAutomationTab: 'manage' }))
    expect(manage).not.toContain('Choose how it starts')
    expect(manage).not.toContain('Manus will')
  })

  it('takes the section from the route so a top-nav click lands on it', () => {
    const updates = renderToStaticMarkup(createElement(AutomationsView, { shell, initialAutomationTab: 'updates' }))
    expect(updates).not.toContain('automations-toolbar')
    const canvas = renderToStaticMarkup(createElement(AutomationsView, { shell, initialAutomationTab: 'canvas' }))
    expect(canvas).toContain('is-canvas-mode')
    const manage = renderToStaticMarkup(createElement(AutomationsView, { shell, initialAutomationTab: 'manage' }))
    expect(manage).toContain('automations-toolbar')
    expect(manage).not.toContain('is-canvas-mode')
  })

  it('offers create and edit previous on the Canvas opener', () => {
    const html = renderToStaticMarkup(createElement(CanvasLanding, {
      automations: [
        {
          id: 'a-1',
          kind: 'advanced',
          title: 'Morning brief',
          prompt: 'Summarize my mail',
          status: 'active',
          schedule: { type: 'daily', time: '09:00' },
          autoApprove: false,
          runMode: 'separate_task',
          agent: '',
          connectors: ['gmail'],
          createdAt: new Date(2026, 9, 25).toISOString()
        }
      ],
      resume: true,
      onResumeChange: () => {},
      onNew: () => {},
      onEdit: () => {}
    }))
    expect(html).toContain('Build an automation')
    expect(html).toContain('Edit previous')
    expect(html).toContain('aria-label="Edit Morning brief"')
    expect(html).toContain('Advanced automation')
    expect(html).toContain('Always open my last canvas')
    expect((html.match(/type="checkbox"/g) ?? []).length).toBe(1)
    expect(html).toContain('checked=""')
  })

  it('shows the empty previous list before anything is built', () => {
    const html = renderToStaticMarkup(createElement(CanvasLanding, {
      automations: [],
      resume: false,
      onResumeChange: () => {},
      onNew: () => {},
      onEdit: () => {}
    }))
    expect(html).toContain('No canvases yet')
    expect(html).not.toContain('checked=""')
  })

  it('leaves the breadcrumb to the app shell: no page renders its own', () => {
    const manage = renderToStaticMarkup(createElement(AutomationsView, { shell, initialAutomationTab: 'manage' }))
    expect(manage).not.toContain('aria-label="Breadcrumb"')
    expect(manage).not.toContain('automations-toolbar-title')
  })

  it('opens the run page from the route so a nav click can close it', () => {
    const run = renderToStaticMarkup(createElement(AutomationsView, { shell, focusRunId: 'run-1' }))
    expect(run).toContain('Run details')
    const list = renderToStaticMarkup(createElement(AutomationsView, { shell, initialAutomationTab: 'updates' }))
    expect(list).not.toContain('Run details')
  })

  it('groups update rows by day with title, time, and full summary', () => {
    const at = (y: number, m: number, d: number, h: number, min = 0): number => new Date(y, m, d, h, min).getTime()
    const html = renderToStaticMarkup(createElement(UpdatesList, {
      todayKey: '2026-10-11',
      onSelect: () => {},
      runs: [
        { id: 'a', title: 'Daily Hacker News Top 10 Digest', startedAt: at(2026, 9, 11, 9), endedAt: at(2026, 9, 11, 9, 5), status: 'succeeded', summary: 'Today digest body.' },
        { id: 'b', title: 'Daily Hacker News Top 10 Digest', startedAt: at(2026, 9, 10, 12), endedAt: at(2026, 9, 10, 12, 2), status: 'succeeded', summary: 'Yesterday digest body.' }
      ]
    }))
    expect(html).toContain('Today')
    expect(html).toContain('Yesterday')
    expect(html).toContain('Yesterday <span>(1)</span>')
    expect(html).toContain('Daily Hacker News Top 10 Digest')
    expect(html).toContain('Today digest body.')
    expect(html).toContain('Yesterday digest body.')
    expect(html).toContain('p-rail-item updates-row')
    expect(html).toContain('updates-row-meta')
    expect(html).toContain('updates-row-icon')
    expect(html).toContain('updates-row-body')
  })

  it('shows the empty-output placeholder in the row body', () => {
    const html = renderToStaticMarkup(createElement(UpdatesList, {
      todayKey: '2026-10-11',
      runs: [
        { id: 'a', title: 'Daily Hacker News Top 10 Digest', startedAt: new Date(2026, 9, 11, 9).getTime(), status: 'succeeded', summary: '' }
      ],
      onSelect: () => {}
    }))
    expect(html).toContain('No output recorded yet.')
    expect(html).toContain('updates-row-body')
  })

  it('does not render a summary strip above the feed', () => {
    const html = renderToStaticMarkup(createElement(UpdatesList, {
      todayKey: '2026-10-11',
      runs: [
        { id: 'a', title: 'Daily Hacker News Top 10 Digest', startedAt: new Date(2026, 9, 11, 9).getTime(), status: 'succeeded', summary: 'Today digest body.' }
      ],
      onSelect: () => {}
    }))
    expect(html).toContain('Today')
    expect(html).not.toContain('updates-summary')
    expect(html).not.toContain('Runs today')
  })
})

describe('automations trail', () => {
  it('names the section of every tab and hides the Updates feed', () => {
    expect(automationsTrail('manage', null)).toEqual(['Manage'])
    expect(automationsTrail('canvas', null)).toEqual(['Canvas'])
    expect(automationsTrail('updates', null)).toEqual([])
  })

  it('nests the open automation under its section', () => {
    expect(automationsTrail('manage', 'Say hello')).toEqual(['Automations', 'Say hello'])
  })
})
