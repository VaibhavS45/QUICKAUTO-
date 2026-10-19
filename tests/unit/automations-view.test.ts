import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { addDaysKey, dayLabel, localDayKey, monthGrid, monthLabel, pastDayLabel, routineOccursOn, routineTitle } from '../../src/renderer/features/automations/dates.js'
import AutomationsView, { ManageDetail, RoutineRail, UpdatesList, routineKindLabel, stepsForRoutine } from '../../src/renderer/features/automations/AutomationsView.js'
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
    expect(html).toContain('List')
    expect(html).toContain('Calendar')
    expect(html).toContain('Create')
  })

  it('updates tab shows the calendar only, without the list view toggle', () => {
    const html = renderToStaticMarkup(createElement(AutomationsView, { shell, initialAutomationTab: 'updates' }))
    expect(html).toContain('Updates')
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
    expect(html).toContain('Daily Hacker News Top 10 Digest')
    expect(html).toContain('Today digest body.')
    expect(html).toContain('Yesterday digest body.')
  })

  it('labels multi-tool routines advanced and single-tool routines scheduled', () => {
    const base = { id: 'r', prompt: 'Do things', runAt: Date.now(), repeat: 'daily', enabled: true }
    expect(routineKindLabel({ ...base, tools: ['gmail', 'sheets'] })).toBe('Advanced')
    expect(routineKindLabel({ ...base, tools: ['github'] })).toBe('Scheduled')
  })

  it('renders the manage detail with sections and history', () => {
    const routine = { id: 'r1', prompt: 'Summarize inbox', tools: ['gmail'], runAt: new Date(2026, 9, 11, 9).getTime(), repeat: 'daily', enabled: false }
    const html = renderToStaticMarkup(createElement(ManageDetail, {
      routine,
      runs: [
        { id: 'run1', routineId: 'r1', title: 'Summarize inbox', startedAt: 1, status: 'succeeded', summary: 'Did the thing.' },
        { id: 'run2', routineId: 'other', title: 'Elsewhere', startedAt: 2, status: 'failed' }
      ],
      onToggle: () => {},
      onRemove: () => {},
      onSelectRun: () => {}
    }))
    expect(html).toContain('Summarize inbox')
    expect(html).toContain('Paused')
    expect(html).toContain('Details')
    expect(html).toContain('History')
    expect(html).toContain('The agent will')
    expect(html).toContain('Advanced settings')
    expect(html).toContain('@gmail')
    expect(html).not.toContain('Elsewhere')
  })

  it('renders the config rail with engine and connector states', () => {
    const html = renderToStaticMarkup(createElement(RoutineRail, {
      routine: { id: 'r1', prompt: 'x', tools: ['gmail', 'sheets'], runAt: 0, repeat: 'daily', enabled: true },
      engine: 'builtin',
      connected: { gmail: false, sheets: true },
      onOpenConnectors: () => {}
    }))
    expect(html).toContain('Agent')
    expect(html).toContain('Built-in')
    expect(html).toContain('Connectors')
    expect(html).toContain('Gmail')
    expect(html).toContain('Google Sheets')
    expect(html).toContain('View all')
  })
})
