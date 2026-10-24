import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import StartChoice from '../../src/renderer/features/automations/start-choice.js'
import Builder, { BuilderSettingsMenu } from '../../src/renderer/features/automations/builder.js'
import { blankDraft, blankTrigger } from '../../src/renderer/features/automations/builder-compile.js'

describe('start choice', () => {
  it('offers schedule, triggered, and advanced paths', () => {
    const html = renderToStaticMarkup(createElement(StartChoice, { onPick: () => {}, onClose: () => {} }))
    expect(html).toContain('Choose how it starts')
    expect(html).toContain('Schedule')
    expect(html).toContain('Triggered task')
    expect(html).toContain('Advanced automation')
    expect(html).toContain('Beta')
    expect(html).toContain('Describe when Palette should act')
    expect(html).toContain('<svg')
  })

  it('puts the weekday on the repeat row for weekly schedules', () => {
    const html = renderToStaticMarkup(
      createElement(Builder, {
        initial: { ...blankDraft(), triggers: [{ ...blankTrigger('schedule'), repeat: 'weekly', weekdays: [6] }] },
        gmailConnected: false,
        onConnect: () => {},
        onClose: () => {},
        onSubmit: async () => null
      })
    )
    expect(html).toContain('Weekly')
    expect(html).toContain('Saturday')
    // The day is a pill in the when row, not a second row of chips.
    expect(html).not.toContain('st-weekdays')
  })

  it('renders the event trigger form for triggered tasks', () => {
    const html = renderToStaticMarkup(
      createElement(Builder, {
        initial: { ...blankDraft(), triggers: [{ ...blankTrigger('event'), event: 'a new conversation is started' }] },
        gmailConnected: false,
        onConnect: () => {},
        onClose: () => {},
        onSubmit: async () => null
      })
    )
    expect(html).toContain('When this happens')
    expect(html).toContain('in Gmail')
    expect(html).toContain('a new conversation is started')
  })

  it('keeps the schedule and the trigger apart', () => {
    const scheduled = renderToStaticMarkup(
      createElement(Builder, {
        initial: blankDraft(),
        gmailConnected: true,
        onConnect: () => {},
        onClose: () => {},
        onSubmit: async () => null
      })
    )
    expect(scheduled).toContain('When')
    expect(scheduled).toContain('Daily')
    expect(scheduled).toContain('AM 9:00')
    // A schedule starts on the clock: no trigger button next to the time.
    expect(scheduled).not.toContain('Add Trigger')

    const triggered = renderToStaticMarkup(
      createElement(Builder, {
        initial: { ...blankDraft(), triggers: [] },
        gmailConnected: true,
        onConnect: () => {},
        onClose: () => {},
        onSubmit: async () => null
      })
    )
    expect(triggered).toContain('When this happens')
    expect(triggered).toContain('+ Add Trigger')
    expect(triggered).not.toContain('AM 9:00')
  })

  it('shows a single task box with a working add menu', () => {
    const html = renderToStaticMarkup(
      createElement(Builder, {
        initial: blankDraft(),
        gmailConnected: true,
        onConnect: () => {},
        onClose: () => {},
        onSubmit: async () => null
      })
    )
    expect(html).toContain('Palette will')
    expect(html).toContain('Describe what Palette should do')
    expect(html).not.toContain('What should it do')
    expect(html).toContain('Add connector or tool')
    expect(html).toContain('Automation settings')
    expect(html).not.toContain('Connectors</span>')
    expect(html).not.toContain('OpenCode')
  })

  it('renders the automation settings menu rows', () => {
    const html = renderToStaticMarkup(
      createElement(BuilderSettingsMenu, {
        agent: '',
        agents: [],
        onAgent: () => {},
        connectorOptions: [],
        connectors: [],
        onConnectors: () => {},
        onConnectApps: () => {},
        expiresAt: '',
        onExpiresAt: () => {}
      })
    )
    for (const label of ['Confirmations', 'Run in', 'Agent', 'Connectors', 'Project', 'Cloud computer', 'Local folder', 'Expiration date']) {
      expect(html).toContain(label)
    }
    expect(html).toContain('Writes blocked')
    expect(html).toContain('Separate task')
    expect(html).toContain('Scheduled runs are read-only')
  })
})
