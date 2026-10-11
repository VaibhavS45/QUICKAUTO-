import type { ComponentType } from 'react'
import type { SettingsNavItem } from './nav.js'
import AgentsTab from './tabs/AgentsTab.js'
import McpPanel from './tabs/McpPanel.js'

export const EXTRA_TABS: Record<string, ComponentType> = {
  agents: AgentsTab,
  mcp: McpPanel
}
export const EXTRA_NAV: SettingsNavItem[] = [
  { id: 'account', label: 'Account', group: 'app', keywords: ['profile', 'local'] },
  { id: 'mcp', label: 'MCP', group: 'system', keywords: ['servers', 'tools', 'protocol'] }
]
