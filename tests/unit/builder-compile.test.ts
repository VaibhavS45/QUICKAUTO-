import { describe, expect, it } from 'vitest'
import { AUTOMATION_TEMPLATES } from '../../src/shared/contracts/automation-templates.js'
import {
  blankDraft,
  blankTrigger,
  draftToAutomation,
  templateToDraft,
  titleFromTask
} from '../../src/renderer/features/automations/schedule/builder-compile.js'

describe('builder compile', () => {
  it('turns the picks into the contract payload', () => {
    const draft = {
      ...blankDraft(),
      title: 'Morning digest',
      task: 'Summarize the news',
      triggers: [{ ...blankTrigger('schedule'), repeat: 'daily' as const, time: '09:00' }]
    }
    const compiled = draftToAutomation(draft)
    expect(compiled.valid).toBe(true)
    expect(compiled.create).toMatchObject({
      kind: 'schedule',
      title: 'Morning digest',
      prompt: 'Summarize the news',
      schedule: { type: 'daily', time: '09:00' },
      autoApprove: false,
      runMode: 'separate_task'
    })
    expect(compiled.create?.connectors).toEqual([])
  })

  it('maps every repeat onto the contract schedule', () => {
    const base = { ...blankDraft(), title: 'Report', task: 'compile slides' }
    const once = draftToAutomation({
      ...base,
      triggers: [{ ...blankTrigger('schedule'), repeat: 'once' as const, time: '14:30', date: '2026-10-09' }]
    })
    expect(once.create?.schedule).toEqual({ type: 'once', time: '14:30', date: '2026-10-09' })

    const weekly = draftToAutomation({
      ...base,
      triggers: [{ ...blankTrigger('schedule'), repeat: 'weekly' as const, time: '09:00', weekdays: [3, 1] }]
    })
    expect(weekly.create?.schedule).toEqual({ type: 'weekly', time: '09:00', weekdays: [1, 3] })

    const monthly = draftToAutomation({
      ...base,
      triggers: [{ ...blankTrigger('schedule'), repeat: 'monthly' as const, time: '08:00', dayOfMonth: 31 }]
    })
    expect(monthly.create?.schedule).toEqual({ type: 'monthly', time: '08:00', dayOfMonth: 31 })
  })

  it('asks for the missing pieces instead of guessing them', () => {
    expect(draftToAutomation({ ...blankDraft(), triggers: [] }).error).toMatch(/trigger/i)
    expect(draftToAutomation({ ...blankDraft(), title: '', task: '', triggers: [blankTrigger('schedule')] }).error).toMatch(/title|describe/i)
    const noDay = draftToAutomation({
      ...blankDraft(),
      title: 'Report',
      task: 'compile slides',
      triggers: [{ ...blankTrigger('schedule'), repeat: 'weekly' as const, time: '09:00' }]
    })
    expect(noDay.valid).toBe(false)
    expect(noDay.error).toMatch(/day of the week/i)
  })

  it('folds event triggers into the prompt and the connectors', () => {
    const draft = {
      ...blankDraft(),
      title: 'Inbox',
      task: 'summarize new mail',
      triggers: [
        { ...blankTrigger('schedule'), repeat: 'daily' as const, time: '09:00' },
        { ...blankTrigger('event'), app: 'gmail', event: 'a new conversation' }
      ]
    }
    const compiled = draftToAutomation(draft)
    expect(compiled.create?.prompt).toBe('summarize new mail. check @gmail for a new conversation')
    expect(compiled.create?.connectors).toContain('gmail')
  })

  it('keeps @tags out of the visible task and carries the ids', () => {
    const draft = {
      ...blankDraft(),
      title: 'Digest',
      task: 'Summarize the news',
      triggers: [{ ...blankTrigger('schedule') }],
      tools: ['websearch']
    }
    const compiled = draftToAutomation(draft)
    expect(compiled.create?.connectors).toContain('websearch')
    expect(compiled.create?.prompt).toBe('Summarize the news')
  })

  it('names an unnamed task from its first sentence', () => {
    expect(titleFromTask('summarize the news. and send it')).toBe('summarize the news')
    const compiled = draftToAutomation({ ...blankDraft(), task: 'summarize the news', triggers: [blankTrigger('schedule')] })
    expect(compiled.create?.title).toBe('summarize the news')
  })

  it('converts templates into editable drafts', () => {
    const scheduled = templateToDraft(AUTOMATION_TEMPLATES[0]!)
    expect(scheduled.triggers[0]).toMatchObject({ kind: 'schedule', repeat: 'daily', time: '20:00' })
    expect(draftToAutomation(scheduled).valid).toBe(true)
    expect(draftToAutomation(scheduled).create?.connectors).toEqual(expect.arrayContaining(['websearch', 'files', 'gmail']))

    const event = templateToDraft(AUTOMATION_TEMPLATES[1]!)
    expect(event.triggers[0]).toMatchObject({ kind: 'event' })
    expect(event.title).toBe(AUTOMATION_TEMPLATES[1]!.title)
  })

  it('keeps @tags out of visible inputs', () => {
    for (const template of AUTOMATION_TEMPLATES) {
      expect(templateToDraft(template).task).not.toContain('@')
    }
  })
})
