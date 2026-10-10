import { EXTRA_NAV } from './extra-tabs.js'

export type SettingsTabId =
  | 'general'
  | 'appearance'
  | 'provider'
  | 'connectors'
  | 'routines'
  | 'usage'
  | (string & {})

export type SettingsGroupId = 'app' | 'ai' | 'system'

export interface SettingsNavItem {
  id: SettingsTabId
  label: string
  group: SettingsGroupId
  keywords: string[]
}

export const SETTINGS_GROUPS: Array<{ id: SettingsGroupId; label: string }> = [
  { id: 'app', label: 'App' },
  { id: 'ai', label: 'AI' },
  { id: 'system', label: 'System' }
]

const BUILTIN_SETTINGS_NAV: SettingsNavItem[] = [
  { id: 'general', label: 'General', group: 'app', keywords: ['profile', 'language', 'background'] },
  { id: 'appearance', label: 'Appearance', group: 'app', keywords: ['shader', 'theme', 'sidebar'] },
  { id: 'provider', label: 'Provider', group: 'ai', keywords: ['model', 'anthropic', 'openai', 'api', 'key'] },
  { id: 'connectors', label: 'Connectors', group: 'ai', keywords: ['composio', 'gmail', 'github', 'notion', 'sheets'] },
  { id: 'routines', label: 'Routines', group: 'system', keywords: ['schedule'] },
  { id: 'usage', label: 'Usage', group: 'system', keywords: ['budget', 'composio'] },
]

export function createSettingsNav(extraNav: SettingsNavItem[] = EXTRA_NAV): SettingsNavItem[] {
  return [...BUILTIN_SETTINGS_NAV, ...extraNav]
}

export const SETTINGS_NAV: SettingsNavItem[] = createSettingsNav()

export function isSettingsTabRegistered(id: string, items: SettingsNavItem[] = SETTINGS_NAV): boolean {
  return items.some((item) => item.id === id)
}

/** Case-insensitive sidebar filter over label, id, and keywords. Pure for unit testing. */
export function filterSettingsNav(query: string): SettingsNavItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return SETTINGS_NAV
  return SETTINGS_NAV.filter((n) => {
    const hay = [n.id, n.label, ...n.keywords].join(' ').toLowerCase()
    return hay.includes(q)
  })
}

export function groupedSettingsNav(items: SettingsNavItem[]): Array<{
  id: SettingsGroupId
  label: string
  items: SettingsNavItem[]
}> {
  return SETTINGS_GROUPS.map((g) => ({
    ...g,
    items: items.filter((n) => n.group === g.id)
  })).filter((g) => g.items.length > 0)
}
