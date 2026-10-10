import { describe, expect, it } from 'vitest'
import { AUTOMATION_TEMPLATES } from '../../src/shared/contracts/automation-templates.js'
import { parseScheduleFromText } from '../../src/main/agent/scheduler.js'
import {
  blankDraft,
  blankTrigger,
  draftToText,
  templateToDraft,
  toAmPm,
  triggerToPhrase
} from '../../src/renderer/features/automations/builder-compile.js'

describe('builder compile', () => {
  it('formats times for the scheduler', () => {
    expect(toAmPm('09:00')).toBe('9:00am')
    expect(toAmPm('18:30')).toBe('6:30pm')
    expect(toAmPm('00:05')).toBe('12:05am')
    expect(toAmPm('nope')).toBeNull()
    expect(toAmPm('25:00')).toBeNull()
  })

  it('compiles every repeat into a phrase the scheduler can fire', () => {
    for (const repeat of ['once', 'daily', 'weekdays'] as const) {
      const phrase = triggerToPhrase({ ...blankTrigger('schedule'), repeat, time: '18:30' })
      expect(phrase).toBeTruthy()
      expect(parseScheduleFromText(`${phrase} do the thing`, new Date(2026, 9, 10, 12, 0, 0))).not.toBeNull()
    }
  })

  it('compiles event triggers as scheduled @app checks', () => {
    const phrase = triggerToPhrase({ ...blankTrigger('event'), repeat: 'daily', time: '09:00', app: 'gmail', event: 'new conversations in my inbox' })
    expect(phrase).toContain('@gmail')
    expect(phrase).toContain('new conversations')
    expect(parseScheduleFromText(`${phrase} yes`, new Date(2026, 9, 10, 12, 0, 0))).not.toBeNull()
    expect(triggerToPhrase({ ...blankTrigger('event'), event: '' })).toBeNull()
  })

  it('validates manual drafts and collects tools', () => {
    expect(draftToText(blankDraft()).valid).toBe(false)
    const draft = {
      ...blankDraft(),
      title: 'Morning digest',
      task: 'Summarize the news @websearch',
      triggers: [{ ...blankTrigger('schedule'), repeat: 'daily' as const, time: '09:00' }]
    }
    const compiled = draftToText(draft)
    expect(compiled.valid).toBe(true)
    expect(compiled.tools).toContain('websearch')
    expect(compiled.text).toContain('Morning digest')
    expect(compiled.text).toContain('every day at 9:00am')
  })

  it('passes describe text straight through', () => {
    expect(draftToText({ ...blankDraft(), mode: 'describe', describe: '  ' }).valid).toBe(false)
    const compiled = draftToText({ ...blankDraft(), mode: 'describe', describe: 'At 6:30pm summarize HN @websearch' })
    expect(compiled.valid).toBe(true)
    expect(compiled.tools).toContain('websearch')
  })

  it('converts templates into editable drafts', () => {
    const scheduled = templateToDraft(AUTOMATION_TEMPLATES[0]!)
    expect(scheduled.triggers[0]).toMatchObject({ kind: 'schedule', repeat: 'daily', time: '20:00' })
    expect(draftToText(scheduled).valid).toBe(true)
    expect(draftToText(scheduled).tools).toEqual(expect.arrayContaining(['websearch', 'files', 'gmail']))

    const event = templateToDraft(AUTOMATION_TEMPLATES[1]!)
    expect(event.triggers[0]).toMatchObject({ kind: 'event' })
    expect(event.title).toBe(AUTOMATION_TEMPLATES[1]!.title)
  })
})
