import { describe, expect, it } from 'vitest'
import { blankDraft, blankTrigger, draftToAutomation } from '../../src/renderer/features/automations/schedule/builder-compile.js'
import { AutomationService } from '../../src/main/automations/schedule/automation-service.js'
import { MemoryRoutineStore, Scheduler } from '../../src/main/automations/schedule/scheduler.js'

describe('Schedule Automation Creation Flow', () => {
  const NOW = new Date(2026, 9, 12, 8, 0, 0) // Monday Oct 12 2026 8:00 AM

  function service(): { service: AutomationService; scheduler: Scheduler } {
    const scheduler = new Scheduler(new MemoryRoutineStore(), { fire: () => {}, now: () => NOW.getTime() })
    return { service: new AutomationService({ scheduler, now: () => NOW.getTime() }), scheduler }
  }

  it('stores the picks the form shows', () => {
    // 1. User configures the schedule: Daily at 10:00, task: "weather in bangalore"
    const draft = {
      ...blankDraft(),
      title: 'Morning digest',
      task: 'weather in bangalore',
      triggers: [{ ...blankTrigger('schedule'), repeat: 'daily' as const, time: '10:00' }],
      tools: ['websearch', 'composio']
    }

    // 2. The form compiles to the contract payload
    const compiled = draftToAutomation(draft)
    expect(compiled.valid).toBe(true)
    expect(compiled.create?.schedule).toEqual({ type: 'daily', time: '10:00' })

    // 3. The service stores it as a routine
    const { service: automations, scheduler } = service()
    const automation = automations.create(compiled.create!)

    expect(automation.title).toBe('Morning digest')
    expect(automation.prompt).toBe('weather in bangalore')
    expect(automation.connectors).toEqual(expect.arrayContaining(['websearch', 'composio']))
    expect(automation.schedule).toEqual({ type: 'daily', time: '10:00' })

    const routine = scheduler.list()[0]!
    expect(routine.repeat).toBe('daily')
    expect(new Date(routine.runAt).getHours()).toBe(10)
    expect(new Date(routine.runAt).getMinutes()).toBe(0)
    expect(routine.enabled).toBe(true)
    expect(routine.tools).toEqual(expect.arrayContaining(['websearch', 'composio']))
  })

  it('keeps the weekday set of a weekly task', () => {
    const draft = {
      ...blankDraft(),
      title: 'Weekdays digest',
      task: 'summarize top AI news',
      triggers: [{ ...blankTrigger('schedule'), repeat: 'weekly' as const, time: '09:00', weekdays: [1, 2, 3, 4, 5] }],
      tools: ['websearch']
    }
    const compiled = draftToAutomation(draft)
    expect(compiled.valid).toBe(true)

    const { service: automations, scheduler } = service()
    const automation = automations.create(compiled.create!)
    expect(automation.schedule).toEqual({ type: 'weekly', time: '09:00', weekdays: [1, 2, 3, 4, 5] })

    const routine = scheduler.list()[0]!
    expect(routine.repeat).toBe('weekly')
    expect(routine.weekdays).toEqual([1, 2, 3, 4, 5])
    expect(routine.tools).toContain('websearch')
  })

  it('runs a one-time task on the picked date', () => {
    const draft = {
      ...blankDraft(),
      title: 'Quarterly report',
      task: 'compile slides',
      triggers: [{ ...blankTrigger('schedule'), repeat: 'once' as const, time: '14:30', date: '2026-10-20' }]
    }
    const compiled = draftToAutomation(draft)
    expect(compiled.valid).toBe(true)

    const { service: automations, scheduler } = service()
    const automation = automations.create(compiled.create!)
    expect(automation.schedule).toEqual({ type: 'once', time: '14:30', date: '2026-10-20' })

    const routine = scheduler.list()[0]!
    expect(routine.repeat).toBe('once')
    expect(routine.enabled).toBe(true)
    expect(routine.prompt).toContain('compile slides')
    const runAt = new Date(routine.runAt)
    expect(runAt.getDate()).toBe(20)
    expect(runAt.getHours()).toBe(14)
  })

  it('keeps a monthly task on its day of the month', () => {
    const draft = {
      ...blankDraft(),
      title: 'Monthly close',
      task: 'close the books',
      triggers: [{ ...blankTrigger('schedule'), repeat: 'monthly' as const, time: '08:00', dayOfMonth: 31 }]
    }
    const compiled = draftToAutomation(draft)
    expect(compiled.valid).toBe(true)

    const { service: automations, scheduler } = service()
    const automation = automations.create(compiled.create!)
    expect(automation.schedule).toEqual({ type: 'monthly', time: '08:00', dayOfMonth: 31 })

    const routine = scheduler.list()[0]!
    expect(routine.repeat).toBe('monthly')
    expect(new Date(routine.runAt).getDate()).toBe(31)
  })
})
