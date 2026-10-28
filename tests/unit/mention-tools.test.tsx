import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  getAvailableMentionTools,
  filterMentionTools,
  parsePromptMentionedTools,
  ToolPillIcon,
  BUILTIN_TOOLS,
  SYSTEM_SKILLS
} from '../../src/renderer/shell/mentionTools.js'

describe('getAvailableMentionTools', () => {
  it('always includes built-in tools and system skills', () => {
    const tools = getAvailableMentionTools({})
    const ids = tools.map((t) => t.id)

    expect(ids).toContain('websearch')
    expect(ids).toContain('files')
    expect(ids).toContain('github')
    expect(ids).toContain('opencode')
    expect(ids).toContain('mcp')

    const builtinKinds = tools.filter((t) => t.kind === 'builtin')
    expect(builtinKinds).toHaveLength(BUILTIN_TOOLS.length)

    const skillKinds = tools.filter((t) => t.kind === 'skill')
    expect(skillKinds).toHaveLength(SYSTEM_SKILLS.length)
  })

  it('excludes unconnected Composio tools and includes only connected ones', () => {
    // When nothing is connected:
    const emptyTools = getAvailableMentionTools({
      configured: false,
      services: [],
      connectedSlugs: []
    })
    const emptyIds = emptyTools.map((t) => t.id)
    expect(emptyIds).not.toContain('gmail')
    expect(emptyIds).not.toContain('calendar')
    expect(emptyIds).not.toContain('notion')
    expect(emptyIds).not.toContain('sheets')
    expect(emptyIds).not.toContain('slack')

    // When Gmail and Calendar are connected:
    const connectedTools = getAvailableMentionTools({
      configured: true,
      gmailConnected: true,
      services: [
        { id: 'calendar', connected: true },
        { id: 'notion', connected: false }
      ],
      connectedSlugs: ['googlecalendar', 'gmail']
    })
    const connectedIds = connectedTools.map((t) => t.id)

    expect(connectedIds).toContain('gmail')
    expect(connectedIds).toContain('calendar')
    expect(connectedIds).not.toContain('notion')
    expect(connectedIds).not.toContain('sheets')
  })

  it('includes dynamic toolkits from connectedSlugs', () => {
    const tools = getAvailableMentionTools({
      configured: true,
      connectedSlugs: ['jira', 'airtable']
    })
    const ids = tools.map((t) => t.id)
    expect(ids).toContain('jira')
    expect(ids).toContain('airtable')
  })
})

describe('filterMentionTools', () => {
  const tools = getAvailableMentionTools({
    gmailConnected: true,
    services: [{ id: 'calendar', connected: true }]
  })

  it('returns all available tools when query is empty', () => {
    expect(filterMentionTools(tools, '')).toHaveLength(tools.length)
  })

  it('filters tools with each letter typed', () => {
    const gMatches = filterMentionTools(tools, 'g')
    const gIds = gMatches.map((t) => t.id)
    expect(gIds).toContain('gmail')
    expect(gIds).toContain('github')
    expect(gIds).not.toContain('files')

    const gmMatches = filterMentionTools(tools, 'gm')
    expect(gmMatches.map((t) => t.id)).toEqual(['gmail'])

    const calMatches = filterMentionTools(tools, 'cal')
    expect(calMatches.map((t) => t.id)).toEqual(['calendar'])

    const openMatches = filterMentionTools(tools, 'open')
    expect(openMatches.map((t) => t.id)).toEqual(['opencode'])

    const browMatches = filterMentionTools(tools, 'brow')
    expect(browMatches.map((t) => t.id)).toContain('websearch')
  })

  it('returns empty array when no tools match query', () => {
    expect(filterMentionTools(tools, 'xyz123')).toEqual([])
  })
})

describe('parsePromptMentionedTools', () => {
  const tools = getAvailableMentionTools({
    gmailConnected: true,
    services: [{ id: 'calendar', connected: true }]
  })

  it('finds mentioned tools from prompt text', () => {
    const prompt = 'Please use @websearch and @gmail to check messages'
    const found = parsePromptMentionedTools(prompt, tools)
    expect(found.map((t) => t.id)).toEqual(['websearch', 'gmail'])
  })

  it('resolves aliases like @email, @sheet, @browser and @web', () => {
    const prompt = 'Draft an @email, search via @browser and check @web'
    const found = parsePromptMentionedTools(prompt, tools)
    expect(found.map((t) => t.id)).toContain('gmail')
    expect(found.map((t) => t.id)).toContain('websearch')
  })

  it('deduplicates repeatedly mentioned tools', () => {
    const prompt = '@websearch find info then @websearch again'
    const found = parsePromptMentionedTools(prompt, tools)
    expect(found.map((t) => t.id)).toEqual(['websearch'])
  })
})

describe('ToolPillIcon', () => {
  it('renders SVG icon for builtin and system tools', () => {
    const webHtml = renderToStaticMarkup(createElement(ToolPillIcon, { tool: BUILTIN_TOOLS[0]! }))
    expect(webHtml).toContain('is-web')
    expect(webHtml).toContain('<svg')

    const browserHtml = renderToStaticMarkup(createElement(ToolPillIcon, { tool: { id: 'browser', label: 'Browser', hint: '', kind: 'builtin' } }))
    expect(browserHtml).toContain('is-browser')
    expect(browserHtml).toContain('<svg')

    const opencodeHtml = renderToStaticMarkup(createElement(ToolPillIcon, { tool: SYSTEM_SKILLS[0]! }))
    expect(opencodeHtml).toContain('is-opencode')
    expect(opencodeHtml).toContain('<svg')
  })

  it('renders calendar mini badge for calendar tool', () => {
    const calHtml = renderToStaticMarkup(createElement(ToolPillIcon, { tool: { id: 'calendar', label: 'Calendar', hint: '', kind: 'composio' } }))
    expect(calHtml).toContain('is-calendar')
    expect(calHtml).toContain('chat-tool-calendar-mini')
    expect(calHtml).toContain('chat-tool-calendar-month')
    expect(calHtml).toContain('chat-tool-calendar-day')
  })

  it('renders brand logo image when logoSrc is provided', () => {
    const tool = {
      id: 'gmail',
      label: 'Gmail',
      hint: 'Gmail',
      kind: 'composio' as const,
      logoSrc: 'data:image/svg+xml;base64,...'
    }
    const html = renderToStaticMarkup(createElement(ToolPillIcon, { tool }))
    expect(html).toContain('has-logo')
    expect(html).toContain('<img')
  })
})
