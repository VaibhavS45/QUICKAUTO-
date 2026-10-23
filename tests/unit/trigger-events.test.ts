import { describe, expect, it } from 'vitest'
import { blankDraft, blankTrigger, draftToAutomation } from '../../src/renderer/features/automations/builder-compile.js'
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

  it('compiles every event into a check the prompt can run', () => {
    for (const item of GMAIL_EVENTS) {
      const compiled = draftToAutomation({
        ...blankDraft(),
        title: 'Inbox',
        task: 'handle it',
        triggers: [
          { ...blankTrigger('schedule'), repeat: 'daily', time: '09:00' },
          { ...blankTrigger('event'), app: 'gmail', event: item.phrase }
        ]
      })
      expect(compiled.valid).toBe(true)
      expect(compiled.create?.prompt).toContain('@gmail')
      expect(compiled.create?.prompt).toContain(item.phrase)
      expect(compiled.create?.connectors).toContain('gmail')
    }
  })
})
