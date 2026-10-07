import { z } from 'zod'

/** Canonical @ tool ids. Aliases resolved in parseMentionedTools. */
export const TOOL_IDS = [
  'calendar',
  'websearch',
  'notion',
  'gmail',
  'sheets',
  'opencode',
  'github',
  'files'
] as const

export type ToolId = (typeof TOOL_IDS)[number]

export const TOOL_ALIASES: Record<string, ToolId> = {
  email: 'gmail',
  sheet: 'sheets'
}

export const TOOL_META: Record<ToolId, { label: string; hint: string }> = {
  calendar: { label: '@calendar', hint: 'Open calendar with a task draft' },
  websearch: { label: '@websearch', hint: 'Search the web (M2)' },
  notion: { label: '@notion', hint: 'Notion via Composio (M3)' },
  gmail: { label: '@gmail', hint: 'Gmail via Composio (M3) — alias @email' },
  sheets: { label: '@sheets', hint: 'Sheets via Composio (M3) — alias @sheet' },
  opencode: { label: '@opencode', hint: 'Coding agent (M5)' },
  github: { label: '@github', hint: 'Repo tasks via local clone (M5)' },
  files: { label: '@files', hint: 'Local files in granted folders (M2)' }
}

/** Extract @mentions from free text, resolving aliases. @calendar is included. */
export function parseMentionedTools(text: string): ToolId[] {
  const found: ToolId[] = []
  const re = /@([a-zA-Z]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const raw = m[1].toLowerCase()
    let id: ToolId | undefined
    if ((TOOL_IDS as readonly string[]).includes(raw)) id = raw as ToolId
    else if (raw in TOOL_ALIASES) id = TOOL_ALIASES[raw]
    if (id && !found.includes(id)) found.push(id)
  }
  return found
}

export const HotkeySchema = z
  .string()
  .min(1)
  .max(60)
  .regex(/^[A-Za-z0-9+ ]+$/, 'Hotkey may only contain letters, digits, + and space')

export type HotkeyString = z.infer<typeof HotkeySchema>

/** Platform default: macOS uses Alt+Space (Cmd+Space = Spotlight). Others Ctrl+Space. */
export function defaultHotkey(platform: string): string {
  return platform === 'darwin' ? 'Alt+Space' : 'Ctrl+Space'
}

export interface PaletteSubmit {
  text: string
  tools: ToolId[]
}

export function toPaletteSubmit(text: string): PaletteSubmit {
  return { text, tools: parseMentionedTools(text) }
}
