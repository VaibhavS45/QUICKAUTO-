import { describe, expect, it } from 'vitest'
import { parseScheduleFromText } from '../../src/main/agent/scheduler.js'
import { blankTrigger } from '../../src/renderer/features/automations/builder-compile.js'
import { triggerToPhrase } from '../../src/renderer/features/automations/builder-compile.js'
import { GMAIL_EVENTS, gmailEventPhrase } from '../../src/renderer/features/automations/trigger-events.js'

describe('trigger events', () => {
  it('catalogs every Gmail event with a label and phrase', () => {
    expect(GMAIL_EVENTS.length).toBeGreaterThan(0)
    const ids = new Set(GMAIL_EVENTS.map((e) => e.id))
    expect(ids.size).toBe(GMAIL_EVENTS.length)
    for (const item of GMAIL_EVENTS) {
      expect(item.label.trim()).toBeTruthy()
      expect(item.phrase.trim()).toBeTruthy()
    }
    expect(GMAIL_EVENTS.map((e) => e.label)).toContain('New attachment')
  })

  it('falls back to a conversation phrase for unknown ids', () => {
    expect(gmailEventPhrase('nope')).toContain('conversation')
    expect(gmailEventPhrase('new-attachment')).toContain('attachment')
  })

  it('compiles every event into a phrase the scheduler can fire', () => {
    for (const item of GMAIL_EVENTS) {
      const phrase = triggerToPhrase({ ...blankTrigger('event'), repeat: 'daily', time: '09:00', app: 'gmail', event: item.phrase })
      expect(phrase).toBeTruthy()
      expect(phrase).toContain('@gmail')
      expect(parseScheduleFromText(`${phrase} yes`, new Date(2026, 9, 10, 12, 0, 0))).not.toBeNull()
    }
  })
})
