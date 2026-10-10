export interface SidebarNavItem {
  id: string
  label: string
  view: string
}

export const SIDEBAR_NAV_ITEMS: SidebarNavItem[] = [
  { id: 'home', label: 'New chat', view: 'home' },
  { id: 'automations', label: 'Automations', view: 'automations' },
  { id: 'plugins', label: 'Plugins', view: 'plugins' }
]

export const SIDEBAR_SECTIONS = ["Today's schedule", 'Recent tasks', 'Chats'] as const
