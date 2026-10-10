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
  { id: 'home', label: 'New chat', view: 'home' },
  { id: 'automations', label: 'Automations', view: 'automations' },
  { id: 'plugins', label: 'Plugins', view: 'plugins' }
]

export const SIDEBAR_SECTIONS = ["Today's schedule", 'Recent tasks', 'Chats'] as const

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
    const knownView = view === 'home' || PRIMARY_NAV.some((item) => item.view === view)
    this.route = knownView ? { view, params } : { view: 'home', params: {} }
    for (const listener of this.listeners) listener(this.route)
    return this.route
  }
}
