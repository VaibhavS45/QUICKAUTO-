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
    expect(html).toContain('Describe when Manus should act')
    expect(html).toContain('<svg')
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
    expect(html).toContain('mailbox')
    expect(html).toContain('a new conversation is started')
  })

  it('renders the schedule pills first and Add Trigger next to them', () => {
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
    // The schedule row and the trigger button live together: adding an event
    // never hides the time.
    expect(scheduled).toContain('Add Trigger')
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
    expect(html).toContain('Manus will')
    expect(html).toContain('Describe what Manus should do')
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
