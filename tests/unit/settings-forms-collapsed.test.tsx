import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import AgentsPanel from '../../src/renderer/settings/tabs/AgentsPanel.js'
import McpPanel from '../../src/renderer/settings/tabs/McpPanel.js'

vi.stubGlobal('window', {})

/** Forms start collapsed: the list is the page, adding is one click. */
describe('settings create forms start collapsed', () => {
  it('AgentsPanel hides the create form until asked', () => {
    const html = renderToStaticMarkup(createElement(AgentsPanel))
    expect(html).toContain('New agent')
    expect(html).not.toContain('agent-id')
    expect(html).not.toContain('System prompt')
  })

  it('McpPanel hides the add-server form until asked', () => {
    const html = renderToStaticMarkup(createElement(McpPanel))
    expect(html).toContain('Add server')
    expect(html).not.toContain('server-id')
    expect(html).not.toContain('Environment secrets')
  })
})
