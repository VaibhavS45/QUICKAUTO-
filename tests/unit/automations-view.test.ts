import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { addDaysKey, dayLabel, localDayKey, monthGrid, monthLabel, routineOccursOn, routineTitle } from '../../src/renderer/features/automations/dates.js'
import AutomationsView, { stepsForRoutine } from '../../src/renderer/features/automations/AutomationsView.js'
import type { ShellApi } from '../../src/renderer/contracts/feature.js'

const shell: ShellApi = {
  navigate: () => {},
  openCalendarWindow: () => {},
  openSettings: () => {},
  notify: () => {}
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
})

describe('AutomationsView', () => {
  it('renders Updates/Manage tabs with a List/Calendar toggle', () => {
    const html = renderToStaticMarkup(createElement(AutomationsView, { shell }))
    expect(html).toContain('Updates')
    expect(html).toContain('Manage')
    expect(html).toContain('Canvas')
    expect(html).toContain('List')
    expect(html).toContain('Calendar')
    expect(html).toContain('Create')
  })

  it('renders the Zap-style canvas chain', () => {
    const steps = stepsForRoutine(undefined)
    expect(steps.map((s) => s.title)).toContain('Trigger')
    expect(steps.map((s) => s.title)).toContain('Gmail')
    const html = renderToStaticMarkup(createElement(AutomationsView, { shell }))
    expect(html).toContain('Canvas')
  })
})
