import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import Builder from '../../src/renderer/features/automations/schedule/builder.js'
import { blankDraft } from '../../src/renderer/features/automations/schedule/builder-compile.js'
import { ChatComposer } from '../../src/renderer/shell/ChatComposer.js'

describe('builder attach + drive picker markup', () => {
  it('renders the add-entry anchor and the chip/error hooks are conditional', () => {
    const html = renderToStaticMarkup(
      createElement(Builder, {
        initial: blankDraft(),
        gmailConnected: true,
        onConnect: () => {},
        onClose: () => {},
        onSubmit: async () => null
      })
    )
    expect(html).toContain('Add connector or tool')
    // No chips without attachments; no error without attach failures.
    expect(html).not.toContain('builder-attached-files')
    expect(html).not.toContain('builder-attach-error')
  })
})

describe('chat composer attach markup', () => {
  it('renders an attach button in the toolbar', () => {
    const html = renderToStaticMarkup(
      createElement(ChatComposer, {
        busy: false,
        onSend: async () => true,
        onOpenConnections: () => {},
        onOpenAutomations: () => {},
        onSelectTemplate: () => {}
      })
    )
    expect(html).toContain('chat-attach-button')
    expect(html).toContain('Attach local files')
  })
})
