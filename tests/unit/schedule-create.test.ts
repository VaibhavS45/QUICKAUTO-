import { describe, expect, it } from 'vitest'
import { draftToText, blankDraft, blankTrigger } from '../../src/renderer/features/automations/builder-compile.js'
import { Scheduler, MemoryRoutineStore, nextFire } from '../../src/main/agent/scheduler.js'
import { routineTitle } from '../../src/renderer/features/automations/dates.js'

describe('Schedule Automation Creation Flow', () => {
  const BASE = new Date(2026, 9, 12, 8, 0, 0) // Monday Oct 12 2026 8:00 AM

  it('compiles and creates a Daily schedule automation for weather with inferred tools', () => {
    // 1. User configures schedule: Daily at 10:00, task: "weather in bangalore"
    const draft = {
      ...blankDraft(),
      title: '',
      task: 'weather in bangalore',
      triggers: [{ ...blankTrigger('schedule'), repeat: 'daily' as const, time: '10:00' }],
      tools: []
    }

    const compiled = draftToText(draft)
    expect(compiled.valid).toBe(true)
    expect(compiled.text).toBe('When: every day at 10:00am. weather in bangalore')

    // 2. Tool inference attaches websearch and composio for weather queries
    const promptText = compiled.text
    const effectiveTools: string[] = []
    const lower = promptText.toLowerCase()
    if (lower.includes('weather') || lower.includes('search')) effectiveTools.push('websearch')
    if (lower.includes('weather')) effectiveTools.push('composio')

    let fullText = promptText
    for (const t of effectiveTools) {
      if (!fullText.toLowerCase().includes(`@${t.toLowerCase()}`)) {
        fullText += ` @${t}`
      }
    }

    expect(fullText).toBe('When: every day at 10:00am. weather in bangalore @websearch @composio')

    // 3. Scheduler registers the routine
    const store = new MemoryRoutineStore()
    const scheduler = new Scheduler(store, { fire: () => {} })
    const routine = scheduler.create(fullText, BASE)

    expect(routine.id).toMatch(/^r-/)
    expect(routine.repeat).toBe('daily')
    expect(routine.tools).toEqual(expect.arrayContaining(['websearch', 'composio']))
    expect(routine.prompt).toContain('weather in bangalore')
    expect(routine.enabled).toBe(true)

    // Fire time is today at 10:00 AM
    const fireDate = new Date(routine.runAt)
    expect(fireDate.getHours()).toBe(10)
    expect(fireDate.getMinutes()).toBe(0)
    expect(fireDate.getDate()).toBe(BASE.getDate())

    // Title displays clean task
    expect(routineTitle(routine.prompt)).toContain('weather in bangalore')
  })

  it('compiles and creates a Weekdays schedule automation', () => {
    const draft = {
      ...blankDraft(),
      title: '',
      task: 'summarize top AI news',
      triggers: [{ ...blankTrigger('schedule'), repeat: 'weekdays' as const, time: '09:00' }],
      tools: ['websearch']
    }

    const compiled = draftToText(draft)
    expect(compiled.valid).toBe(true)
    expect(compiled.text).toContain('weekdays at 9:00am')

    const store = new MemoryRoutineStore()
    const scheduler = new Scheduler(store, { fire: () => {} })
    const routine = scheduler.create(compiled.text, BASE)

    expect(routine.repeat).toBe('weekdays')
    expect(routine.tools).toContain('websearch')
    expect(routineTitle(routine.prompt)).toContain('summarize top AI news')

    // Next fire skips weekends
    const fridayAfternoon = new Date(2026, 9, 16, 17, 0, 0).getTime()
    const nextMs = nextFire(routine, fridayAfternoon)
    expect(nextMs).not.toBeNull()
    const nextDate = new Date(nextMs!)
    expect(nextDate.getDay()).toBe(1) // Monday
  })

  it('compiles and creates a Once schedule automation', () => {
    const draft = {
      ...blankDraft(),
      title: 'Quarterly report',
      task: 'compile slides',
      triggers: [{ ...blankTrigger('schedule'), repeat: 'once' as const, time: '14:30' }],
      tools: []
    }

    const compiled = draftToText(draft)
    expect(compiled.valid).toBe(true)

    const store = new MemoryRoutineStore()
    const scheduler = new Scheduler(store, { fire: () => {} })
    const routine = scheduler.create(compiled.text, BASE)

    expect(routine.repeat).toBe('once')
    expect(routine.enabled).toBe(true)
    expect(routineTitle(routine.prompt)).toContain('Quarterly report')
    expect(routine.prompt).toContain('compile slides')
  })
})
