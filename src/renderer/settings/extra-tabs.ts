import type { ComponentType } from 'react'
import type { SettingsNavItem } from './nav.js'
import AgentsTab from './tabs/AgentsTab.js'
import McpPanel from './tabs/McpPanel.js'
import PluginsPanel from './tabs/PluginsPanel.js'

export const EXTRA_TABS: Record<string, ComponentType> = {
  agents: AgentsTab,
  mcp: McpPanel,
  plugins: PluginsPanel
}
export const EXTRA_NAV: SettingsNavItem[] = [
  { id: 'account', label: 'Account', group: 'app', keywords: ['profile', 'local'] },
  { id: 'plugins', label: 'Plugins', group: 'system', keywords: ['extensions', 'enable', 'disable'] },
  { id: 'mcp', label: 'MCP', group: 'system', keywords: ['servers', 'tools', 'protocol'] }
]
