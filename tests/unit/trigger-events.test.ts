import { describe, expect, it } from 'vitest'
import { blankDraft, blankTrigger, draftToAutomation } from '../../src/renderer/features/automations/builder-compile.js'
import {
  GMAIL_EVENTS,
  TIMER_TRIGGER,
  TRIGGER_APPS,
  gmailEventPhrase,
  triggerApp,
  triggerMention
} from '../../src/renderer/features/automations/trigger-events.js'
import { hasTriggerIcon } from '../../src/renderer/features/automations/trigger-icons.js'

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

  it('lists every app once with an icon and at least one event', () => {
    const ids = new Set(TRIGGER_APPS.map((app) => app.id))
    expect(ids.size).toBe(TRIGGER_APPS.length)
    const labels = TRIGGER_APPS.map((app) => app.label)
    expect(labels).toContain('Slack')
    expect(labels).toContain('Shopify')
    expect(labels).toContain('Webhook')
    for (const app of TRIGGER_APPS) {
      expect(app.label.trim()).toBeTruthy()
      expect(app.color.trim()).toBeTruthy()
      expect(hasTriggerIcon(app.id), `missing icon for ${app.id}`).toBe(true)
      expect(app.events.length).toBeGreaterThan(0)
      const eventIds = new Set(app.events.map((event) => event.id))
      expect(eventIds.size).toBe(app.events.length)
      for (const event of app.events) {
        expect(event.label.trim()).toBeTruthy()
        expect(event.phrase.trim()).toBeTruthy()
      }
    }
    expect(hasTriggerIcon(TIMER_TRIGGER.id)).toBe(true)
  })

  it('routes native toolkits to their own mention and the rest to @composio', () => {
    expect(triggerMention('gmail')).toBe('gmail')
    expect(triggerMention('notion')).toBe('notion')
    expect(triggerMention('slack')).toBe('composio')
    expect(triggerApp('slack')?.label).toBe('Slack')
    expect(triggerApp('nope')).toBeUndefined()
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

  it('folds a condition into the event check', () => {
    const compiled = draftToAutomation({
      ...blankDraft(),
      task: 'triage mail',
      triggers: [
        { ...blankTrigger('schedule'), repeat: 'daily', time: '09:00' },
        {
          ...blankTrigger('event'),
          app: 'gmail',
          event: 'a new email is received',
          condition: 'from my manager'
        }
      ]
    })
    expect(compiled.valid).toBe(true)
    expect(compiled.create?.prompt).toContain('check @gmail for a new email is received only when from my manager')
  })

  it('compiles non-native apps through the composio connector', () => {
    const compiled = draftToAutomation({
      ...blankDraft(),
      task: 'post a summary',
      triggers: [
        { ...blankTrigger('schedule'), repeat: 'daily', time: '09:00' },
        { ...blankTrigger('event'), app: 'slack', event: 'you are mentioned in a message' }
      ]
    })
    expect(compiled.valid).toBe(true)
    expect(compiled.create?.prompt).toContain('check @composio for you are mentioned in a message')
    expect(compiled.create?.connectors).toContain('composio')
  })
})
