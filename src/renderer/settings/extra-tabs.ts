import type { ComponentType } from 'react'
import type { SettingsNavItem } from './nav.js'
import ApiPanel from './tabs/ApiPanel.js'
import AgentsPanel from './tabs/AgentsPanel.js'
import McpPanel from './tabs/McpPanel.js'
import PluginsPanel from './tabs/PluginsPanel.js'

export const EXTRA_TABS: Record<string, ComponentType> = {
  api: ApiPanel,
  agents: AgentsPanel,
  mcp: McpPanel,
  plugins: PluginsPanel
}
export const EXTRA_NAV: SettingsNavItem[] = [
  { id: 'account', label: 'Account', group: 'app', keywords: ['profile', 'local'] },
  { id: 'plugins', label: 'Plugins', group: 'system', keywords: ['extensions', 'enable', 'disable'] },
  { id: 'mcp', label: 'MCP', group: 'ai', keywords: ['servers', 'tools', 'protocol'] },
  { id: 'api', label: 'API', group: 'ai', keywords: ['keys', 'base url', 'server'] },
  { id: 'agents', label: 'Agents', group: 'system', keywords: ['custom', 'assistant', 'prompt'] }
]
