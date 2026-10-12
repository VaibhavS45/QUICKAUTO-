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
  /** i18n key prefix in strings.ts (sc.<name>.action / sc.<name>.desc). */
  textId: 'sc.palette' | 'sc.settings' | 'sc.newchat' | 'sc.close'
}

export const APP_SHORTCUTS: AppShortcut[] = [
  {
    id: 'palette',
    action: 'Open / close command palette',
    keys: ['⌘K', 'Ctrl K'],
    description: 'Search commands and jump to recent chats.',
    textId: 'sc.palette'
  },
  {
    id: 'settings',
    action: 'Open settings',
    keys: ['⌘,', 'Ctrl ,'],
    description: 'Open the settings panel.',
    textId: 'sc.settings'
  },
  {
    id: 'new-chat',
    action: 'New chat',
    keys: ['⌘N', 'Ctrl N'],
    description: 'Start a fresh chat from anywhere.',
    textId: 'sc.newchat'
  },
  {
    id: 'close',
    action: 'Close dialog',
    keys: ['Esc'],
    description: 'Close settings, the palette, menus, and notifications.',
    textId: 'sc.close'
  }
]
