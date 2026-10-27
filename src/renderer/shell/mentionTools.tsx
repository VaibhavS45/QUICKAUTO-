import React from 'react'
import { getConnectorLogo } from '../settings/connectorLogos.js'
import { TOOL_ALIASES } from '../../shared/types.js'

export interface MentionToolItem {
  id: string
  label: string
  hint: string
  kind: 'builtin' | 'skill' | 'composio'
  logoSrc?: string
  connected?: boolean
}

export interface ConnectorStatusContext {
  configured?: boolean
  services?: Array<{ id: string; connected: boolean; detail?: string }>
  connectedSlugs?: string[]
  gmailConnected?: boolean
}

export const BUILTIN_TOOLS: MentionToolItem[] = [
  {
    id: 'websearch',
    label: 'Web search',
    hint: 'Search the web for up-to-date information',
    kind: 'builtin',
    connected: true
  },
  {
    id: 'files',
    label: 'Files',
    hint: 'Access files in shared local folders',
    kind: 'builtin',
    connected: true
  },
  {
    id: 'github',
    label: 'GitHub',
    hint: 'PR reviews and repositories via local gh CLI',
    kind: 'builtin',
    connected: true
  }
]

export const SYSTEM_SKILLS: MentionToolItem[] = [
  {
    id: 'opencode',
    label: 'OpenCode',
    hint: 'Coding agent for codebase editing and inspection',
    kind: 'skill',
    connected: true
  },
  {
    id: 'mcp',
    label: 'MCP',
    hint: 'Tools from active Model Context Protocol servers',
    kind: 'skill',
    connected: true
  }
]

export function getAvailableMentionTools(context: ConnectorStatusContext): MentionToolItem[] {
  const isServiceConnected = (id: string, slug?: string): boolean => {
    if (context.services?.some((s) => s.id === id && s.connected)) return true
    if (slug && context.connectedSlugs?.some((s) => s.toLowerCase() === slug.toLowerCase())) return true
    return false
  }

  const allComposio: MentionToolItem[] = [
    {
      id: 'gmail',
      label: 'Gmail',
      hint: 'Draft replies and search your inbox',
      kind: 'composio',
      logoSrc: getConnectorLogo('gmail'),
      connected: Boolean(context.gmailConnected || isServiceConnected('gmail', 'gmail'))
    },
    {
      id: 'calendar',
      label: 'Calendar',
      hint: 'Understand schedule, events, and manage time',
      kind: 'composio',
      logoSrc: getConnectorLogo('calendar'),
      connected: isServiceConnected('calendar', 'googlecalendar') || isServiceConnected('calendar', 'calendar')
    },
    {
      id: 'notion',
      label: 'Notion',
      hint: 'Search workspace content and update notes',
      kind: 'composio',
      logoSrc: getConnectorLogo('notion'),
      connected: isServiceConnected('notion', 'notion')
    },
    {
      id: 'sheets',
      label: 'Sheets',
      hint: 'Read and update Google Sheets spreadsheets',
      kind: 'composio',
      connected: isServiceConnected('sheets', 'googlesheets') || isServiceConnected('sheets', 'sheets')
    },
    {
      id: 'drive',
      label: 'Google Drive',
      hint: 'Access and read Google Drive files',
      kind: 'composio',
      logoSrc: getConnectorLogo('google-workspace'),
      connected: isServiceConnected('google-workspace', 'googledrive') || isServiceConnected('google-workspace', 'googleworkspace')
    },
    {
      id: 'slack',
      label: 'Slack',
      hint: 'Search and read Slack workspace messages',
      kind: 'composio',
      logoSrc: getConnectorLogo('slack'),
      connected: isServiceConnected('slack', 'slack')
    },
    {
      id: 'instagram',
      label: 'Instagram',
      hint: 'Manage Instagram posts and activity',
      kind: 'composio',
      logoSrc: getConnectorLogo('instagram'),
      connected: isServiceConnected('instagram', 'instagram')
    },
    {
      id: 'outlook',
      label: 'Outlook',
      hint: 'Read and manage Outlook emails',
      kind: 'composio',
      logoSrc: getConnectorLogo('outlook'),
      connected: isServiceConnected('outlook', 'outlook')
    },
    {
      id: 'meta-ads',
      label: 'Meta Ads',
      hint: 'Analyze and manage Meta Ads campaigns',
      kind: 'composio',
      logoSrc: getConnectorLogo('meta-ads'),
      connected: isServiceConnected('meta-ads', 'facebook') || isServiceConnected('meta-ads', 'meta-ads')
    }
  ]

  if (context.configured) {
    allComposio.push({
      id: 'composio',
      label: 'Composio',
      hint: 'Search and use connected Composio integrations',
      kind: 'composio',
      connected: Boolean((context.connectedSlugs?.length ?? 0) > 0 || allComposio.some((c) => c.connected))
    })
  }

  // Include any extra dynamically connected toolkits reported in connectedSlugs
  if (context.connectedSlugs) {
    for (const slug of context.connectedSlugs) {
      const lower = slug.toLowerCase()
      const known = allComposio.some(
        (c) => c.id.toLowerCase() === lower ||
          (lower === 'googlecalendar' && c.id === 'calendar') ||
          (lower === 'googledrive' && c.id === 'drive') ||
          (lower === 'googlesheets' && c.id === 'sheets')
      )
      if (!known) {
        const title = lower.charAt(0).toUpperCase() + lower.slice(1)
        allComposio.push({
          id: lower,
          label: title,
          hint: `${title} connected via Composio`,
          kind: 'composio',
          connected: true
        })
      }
    }
  }

  // Only show Composio tools that are connected!
  const connectedComposio = allComposio.filter((t) => t.connected)

  return [
    ...BUILTIN_TOOLS,
    ...SYSTEM_SKILLS,
    ...connectedComposio
  ]
}

export function filterMentionTools(tools: MentionToolItem[], typedQuery: string): MentionToolItem[] {
  const q = typedQuery.trim().toLowerCase()
  if (!q) return tools
  return tools.filter((t) =>
    t.id.toLowerCase().includes(q) ||
    t.label.toLowerCase().includes(q)
  )
}

export function parsePromptMentionedTools(text: string, availableTools: MentionToolItem[]): MentionToolItem[] {
  const re = /(?:^|\s)@([a-zA-Z0-9_-]+)/g
  const result: MentionToolItem[] = []
  const seen = new Set<string>()
  let m: RegExpExecArray | null

  while ((m = re.exec(text)) !== null) {
    const raw = m[1].toLowerCase()
    const aliased = (raw in TOOL_ALIASES ? TOOL_ALIASES[raw] : raw) ?? raw
    const matched =
      availableTools.find((t) => t.id.toLowerCase() === raw) ??
      availableTools.find((t) => t.id.toLowerCase() === aliased) ??
      ALL_CATALOG_MAP[raw] ??
      ALL_CATALOG_MAP[aliased]

    if (matched && !seen.has(matched.id)) {
      seen.add(matched.id)
      result.push(matched)
    }
  }

  return result
}

const ALL_CATALOG_MAP: Record<string, MentionToolItem> = {
  websearch: BUILTIN_TOOLS[0]!,
  files: BUILTIN_TOOLS[1]!,
  github: BUILTIN_TOOLS[2]!,
  opencode: SYSTEM_SKILLS[0]!,
  mcp: SYSTEM_SKILLS[1]!,
  gmail: { id: 'gmail', label: 'Gmail', hint: 'Draft replies and search your inbox', kind: 'composio', logoSrc: getConnectorLogo('gmail') },
  calendar: { id: 'calendar', label: 'Calendar', hint: 'Understand schedule and events', kind: 'composio', logoSrc: getConnectorLogo('calendar') },
  notion: { id: 'notion', label: 'Notion', hint: 'Search workspace and update notes', kind: 'composio', logoSrc: getConnectorLogo('notion') },
  sheets: { id: 'sheets', label: 'Sheets', hint: 'Read and update spreadsheets', kind: 'composio' },
  drive: { id: 'drive', label: 'Google Drive', hint: 'Access Google Drive files', kind: 'composio', logoSrc: getConnectorLogo('google-workspace') },
  slack: { id: 'slack', label: 'Slack', hint: 'Search and read Slack workspace', kind: 'composio', logoSrc: getConnectorLogo('slack') },
  instagram: { id: 'instagram', label: 'Instagram', hint: 'Manage Instagram content', kind: 'composio', logoSrc: getConnectorLogo('instagram') },
  outlook: { id: 'outlook', label: 'Outlook', hint: 'Read and manage Outlook emails', kind: 'composio', logoSrc: getConnectorLogo('outlook') },
  'meta-ads': { id: 'meta-ads', label: 'Meta Ads', hint: 'Manage Meta Ads campaigns', kind: 'composio', logoSrc: getConnectorLogo('meta-ads') },
  composio: { id: 'composio', label: 'Composio', hint: 'Connected Composio integrations', kind: 'composio' }
}

export function ToolPillIcon({ tool }: { tool: MentionToolItem }): React.JSX.Element {
  if (tool.logoSrc) {
    return (
      <span className="chat-tool-pill-icon has-logo" aria-hidden="true">
        <img src={tool.logoSrc} alt="" />
      </span>
    )
  }

  switch (tool.id) {
    case 'websearch':
    case 'browser':
      return (
        <span className="chat-tool-pill-icon is-web" aria-hidden="true">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
        </span>
      )
    case 'calendar':
      return (
        <span className="chat-tool-pill-icon is-calendar" aria-hidden="true">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="18" rx="3" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        </span>
      )
    case 'sheets':
      return (
        <span className="chat-tool-pill-icon is-sheets" aria-hidden="true">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="3" y1="15" x2="21" y2="15" />
            <line x1="9" y1="3" x2="9" y2="21" />
            <line x1="15" y1="3" x2="15" y2="21" />
          </svg>
        </span>
      )
    case 'files':
      return (
        <span className="chat-tool-pill-icon is-files" aria-hidden="true">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
          </svg>
        </span>
      )
    case 'github':
      return (
        <span className="chat-tool-pill-icon is-github" aria-hidden="true">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
            <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
          </svg>
        </span>
      )
    case 'opencode':
      return (
        <span className="chat-tool-pill-icon is-opencode" aria-hidden="true">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4 17 10 11 4 5" />
            <line x1="12" y1="19" x2="20" y2="19" />
          </svg>
        </span>
      )
    case 'mcp':
      return (
        <span className="chat-tool-pill-icon is-mcp" aria-hidden="true">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 2v6m0 8v6M2 12h6m8 0h6" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        </span>
      )
    case 'composio':
      return (
        <span className="chat-tool-pill-icon is-composio" aria-hidden="true">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
            <line x1="12" y1="22.08" x2="12" y2="12" />
          </svg>
        </span>
      )
    default:
      return (
        <span className="chat-tool-pill-icon is-web" aria-hidden="true">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </span>
      )
  }
}
