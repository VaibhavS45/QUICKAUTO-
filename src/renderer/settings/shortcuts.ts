/**
 * Keyboard shortcuts shown in Settings > General. These mirror the bindings
 * wired in ShellApp (`src/renderer/shell/ShellApp.tsx`): Cmd/Ctrl variants
 * for cross-platform parity, plus Escape to close dialogs and menus.
 */

export interface AppShortcut {
  id: string
  action: string
  keys: string[]
  description: string
}

export const APP_SHORTCUTS: AppShortcut[] = [
  {
    id: 'palette',
    action: 'Open / close command palette',
    keys: ['⌘K', 'Ctrl K'],
    description: 'Search commands and jump to recent chats.'
  },
  {
    id: 'settings',
    action: 'Open settings',
    keys: ['⌘,', 'Ctrl ,'],
    description: 'Open the settings panel.'
  },
  {
    id: 'new-chat',
    action: 'New chat',
    keys: ['⌘N', 'Ctrl N'],
    description: 'Start a fresh chat from anywhere.'
  },
  {
    id: 'close',
    action: 'Close dialog',
    keys: ['Esc'],
    description: 'Close settings, the palette, menus, and notifications.'
  }
]
