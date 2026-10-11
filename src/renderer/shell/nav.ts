export interface PrimaryNavItem {
  id: string
  label: string
  view: string
}

export interface ShellRoute {
  view: string
  params: Record<string, unknown>
}

export const PRIMARY_NAV: PrimaryNavItem[] = [
  { id: 'home', label: 'Automate', view: 'home' }
]

export interface RailTab {
  id: 'updates' | 'manage' | 'canvas'
  label: string
  icon: string
}

export const AUTOMATION_TABS: RailTab[] = [
  { id: 'updates', label: 'Updates', icon: 'updates' },
  { id: 'manage', label: 'Manage', icon: 'manage' },
  { id: 'canvas', label: 'Canvas', icon: 'canvas' }
]

export type AutomationTabId = RailTab['id']

export function parseAutomationTab(value: unknown): AutomationTabId | undefined {
  return value === 'updates' || value === 'manage' || value === 'canvas' ? value : undefined
}

export const SIDEBAR_SECTIONS = ['Chats'] as const

export const FORBIDDEN_LABELS = [
  'Computers',
  'Agents',
  'Library',
  'Creations',
  'Projects',
  'More',
  'Calendar'
] as const

export class ShellRouter {
  private route: ShellRoute = { view: 'home', params: {} }
  private readonly listeners = new Set<(route: ShellRoute) => void>()

  get current(): ShellRoute {
    return this.route
  }

  subscribe(listener: (route: ShellRoute) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  navigate(view: string, params: Record<string, unknown> = {}): ShellRoute {
    const knownView =
      view === 'home' ||
      view === 'automations' ||
      PRIMARY_NAV.some((item) => item.view === view) ||
      (view === 'chat' && typeof params['chatId'] === 'string')
    this.route = knownView ? { view, params } : { view: 'home', params: {} }
    for (const listener of this.listeners) listener(this.route)
    return this.route
  }
}
