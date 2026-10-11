import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import StartChoice from '../../src/renderer/features/automations/start-choice.js'
import Builder from '../../src/renderer/features/automations/builder.js'
import { blankDraft, blankTrigger } from '../../src/renderer/features/automations/builder-compile.js'

describe('start choice', () => {
  it('offers schedule, triggered, and advanced paths', () => {
    const html = renderToStaticMarkup(createElement(StartChoice, { onPick: () => {}, onClose: () => {} }))
    expect(html).toContain('Choose how it starts')
    expect(html).toContain('Schedule')
    expect(html).toContain('Triggered task')
    expect(html).toContain('Advanced automation')
    expect(html).toContain('Beta')
  })

  it('renders the describe form for advanced automations', () => {
    const html = renderToStaticMarkup(
      createElement(Builder, {
        initial: { ...blankDraft(), mode: 'describe', describe: 'At 6pm ping me' },
        gmailConnected: true,
        onConnect: () => {},
        onClose: () => {},
        onSubmit: async () => null
      })
    )
    expect(html).toContain('Describe when Manus should act')
  })

  it('renders the event trigger form for triggered tasks', () => {
    const html = renderToStaticMarkup(
      createElement(Builder, {
        initial: { ...blankDraft(), triggers: [blankTrigger('event')] },
        gmailConnected: false,
        onConnect: () => {},
        onClose: () => {},
        onSubmit: async () => null
      })
    )
    expect(html).toContain('When this happens')
    expect(html).toContain('mailbox')
  })
})
