import { describe, expect, it } from 'vitest'
import {
  automationMeta,
  draftFrom,
  draftToPatch,
  formatDate,
  isDirty,
  manageFilterOf,
  matchesManageFilter,
  pickerTime,
  timeOptions,
  validateDraft,
  weekdayText,
  type AutomationDraft
} from '../../src/renderer/features/automations/schedule/scheduled.js'
import type { Automation } from '../../src/shared/contracts/automations.js'

function automation(over: Partial<Automation> = {}): Automation {
  return {
    id: 'a1',
    kind: 'schedule',
    title: 'Nightly sync',
    prompt: 'sync the rows',
    status: 'active',
    schedule: { type: 'daily', time: '09:00' },
    autoApprove: false,
    runMode: 'separate_task',
    agent: '',
    connectors: ['notion'],
    createdAt: '2026-10-07T12:00:00.000Z',
    ...over
  }
}

function draft(over: Partial<AutomationDraft> = {}): AutomationDraft {
  return {
    title: 'Nightly sync',
    prompt: 'sync the rows',
    scheduleType: 'daily',
    time: '09:00',
    date: '',
    weekdays: [],
    autoApprove: false,
    runMode: 'separate_task',
    agent: '',
    connectors: ['notion'],
    expiresAt: '',
    ...over
  }
}

describe('time helpers', () => {
  it('offers every quarter hour of the day', () => {
    const options = timeOptions()
    expect(options).toHaveLength(96)
    expect(options[0]).toBe('00:00')
    expect(options[95]).toBe('23:45')
  })

  it('shows the picker time in 12h form', () => {
    expect(pickerTime('00:00')).toBe('AM 12:00')
    expect(pickerTime('09:05')).toBe('AM 9:05')
    expect(pickerTime('13:30')).toBe('PM 1:30')
  })

  it('formats a date and lists weekdays', () => {
    expect(formatDate('2026-10-09')).toMatch(/2026/)
    expect(formatDate(undefined)).toBe('—')
    expect(weekdayText([1, 3])).toBe('Mon, Wed')
    expect(weekdayText()).toBe('no days')
  })
})

describe('automationMeta', () => {
  it('describes each schedule type', () => {
    expect(automationMeta(automation())).toBe('Schedule · Repeat daily at 09:00')
    expect(automationMeta(automation({ schedule: { type: 'weekly', time: '09:00', weekdays: [1, 2] } })))
      .toBe('Schedule · Repeat weekly on Mon, Tue at 09:00')
    expect(automationMeta(automation({ kind: 'advanced', schedule: undefined }))).toBe('Advanced automation')
  })
})

describe('manage filter', () => {
  it('splits automations into schedule, trigger and canvas', () => {
    expect(manageFilterOf(automation())).toBe('schedule')
    expect(manageFilterOf(automation({ prompt: 'Summarize. check @gmail for new email' }))).toBe('trigger')
    expect(manageFilterOf(automation({ kind: 'advanced' }))).toBe('canvas')
  })

  it('shows everything for All and only the matching kind otherwise', () => {
    const rows = [
      automation(),
      automation({ id: 'a2', prompt: 'watch. check @notion for changes' }),
      automation({ id: 'a3', kind: 'advanced' })
    ]
    expect(rows.filter((row) => matchesManageFilter(row, 'all'))).toHaveLength(3)
    expect(rows.filter((row) => matchesManageFilter(row, 'trigger')).map((row) => row.id)).toEqual(['a2'])
    expect(rows.filter((row) => matchesManageFilter(row, 'canvas')).map((row) => row.id)).toEqual(['a3'])
  })
})

describe('draft helpers', () => {
  it('round-trips an automation into a draft and back', () => {
    const source = automation({ expiresAt: '2026-12-01T00:00:00.000Z' })
    const current = draftFrom(source)
    expect(current.title).toBe('Nightly sync')
    expect(current.expiresAt).toBe('2026-12-01')
    expect(isDirty(current, draftFrom(source))).toBe(false)
    expect(isDirty({ ...current, title: 'Other' }, current)).toBe(true)
  })

  it('patches the schedule only for scheduled automations', () => {
    const scheduled = draftToPatch(draft({ scheduleType: 'weekly', weekdays: [3, 1] }), 'schedule')
    expect(scheduled.schedule).toEqual({ type: 'weekly', time: '09:00', weekdays: [1, 3] })
    expect(draftToPatch(draft(), 'advanced').schedule).toBeUndefined()
  })

  it('validates title, prompt and one-time dates', () => {
    expect(validateDraft(draft({ title: '' }), 'schedule')).toMatch(/title/i)
    expect(validateDraft(draft({ prompt: '' }), 'schedule')).toMatch(/prompt/i)
    expect(validateDraft(draft({ scheduleType: 'once', date: '' }), 'schedule')).toMatch(/date/i)
    expect(validateDraft(draft({ scheduleType: 'once', date: '2020-01-01' }), 'schedule')).toMatch(/future/i)
    expect(validateDraft(draft(), 'schedule')).toBeNull()
  })
})
