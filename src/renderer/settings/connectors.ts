export interface ConnectorServiceState {
  id: string
  connected: boolean
  detail?: string
}

export type ConnectorStatus = 'connected' | 'action' | 'waiting'

export interface ConnectorRow {
  id: string
  name: string
  blurb: string
  glyph: string
  color: string
  status: ConnectorStatus
  detail?: string
  action?: 'connect-gmail' | 'refresh-github' | 'composio-key'
}

const META: Record<string, { name: string; blurb: string; glyph: string; color: string }> = {
  gmail: { name: 'Gmail', blurb: "Google's email — read, draft and send with approval.", glyph: 'M', color: '#EA4335' },
  github: { name: 'GitHub', blurb: 'Local gh CLI — read-only repo access via allowlist.', glyph: 'O', color: '#6E7681' },
  notion: { name: 'Notion', blurb: 'Notes, docs and tasks via Composio.', glyph: 'N', color: '#E8E8E8' },
  sheets: { name: 'Google Sheets', blurb: 'Cloud spreadsheets via Composio.', glyph: '+', color: '#34A853' },
  websearch: { name: 'Web Search', blurb: 'Web answers with sources via Composio.', glyph: '⌕', color: '#4285F4' }
}

/**
 * Merge live statuses into Image-3-style rows (pure, unit-tested).
 * Composio rows need the project key first; Gmail connects in-app via the
 * browser; GitHub authenticates in the terminal (`gh auth login`).
 */
export function buildConnectorRows(input: {
  configured: boolean
  services: ConnectorServiceState[]
  gmailConnected: boolean | null
  gmailDetail?: string
  ghInstalled?: boolean
  ghAuthenticated?: boolean
  ghDetail?: string
}): ConnectorRow[] {
  const svc = (id: string): ConnectorServiceState | undefined => input.services.find((s) => s.id === id)
  const rows: ConnectorRow[] = []
  const gmail = META['gmail']
  if (gmail) {
    rows.push({
      id: 'gmail',
      ...gmail,
      status: input.gmailConnected ? 'connected' : 'action',
      ...(input.gmailDetail || !input.gmailConnected ? { detail: input.gmailDetail ?? 'Not connected yet.' } : {}),
      ...(!input.gmailConnected ? { action: 'connect-gmail' as const } : {})
    })
  }
  const gh = META['github']
  if (gh) {
    const ok = !!input.ghInstalled && !!input.ghAuthenticated
    rows.push({
      id: 'github',
      ...gh,
      status: ok ? 'connected' : 'action',
      detail: input.ghDetail ?? (ok ? 'gh ready.' : 'Run `gh auth login`, then Refresh.'),
      action: 'refresh-github'
    })
  }
  for (const id of ['notion', 'sheets', 'websearch']) {
    const meta = META[id]
    if (!meta) continue
    const s = svc(id)
    const connected = !!s?.connected
    rows.push({
      id,
      ...meta,
      status: connected ? 'connected' : input.configured ? 'waiting' : 'action',
      ...(s?.detail || (!connected && !input.configured) ? { detail: s?.detail ?? 'Add the Composio key to enable.' } : {}),
      ...(!connected && !input.configured ? { action: 'composio-key' as const } : {})
    })
  }
  return rows
}
