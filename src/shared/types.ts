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
  gmail: { label: '@gmail', hint: 'Gmail via Composio (read-only) — alias @email' },
  sheets: { label: '@sheets', hint: 'Sheets via Composio (M3) — alias @sheet' },
  opencode: { label: '@opencode', hint: 'Coding agent (M5)' },
  github: { label: '@github', hint: 'Repo tasks via local clone (M5)' },
  files: { label: '@files', hint: 'Local files in granted folders (M2)' }
}

/** Extract @mentions from free text, resolving aliases. @calendar is included.
 * An @ only counts at the start of the text or after whitespace, so email
 * addresses (me@gmail.com) and handles (a@b) never count as mentions. */
export function parseMentionedTools(text: string): ToolId[] {
  const found: ToolId[] = []
  const re = /(?:^|\s)@([a-zA-Z]+)/g
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

/** Active @mention fragment being typed (letters right after the last @).
 * Returns null unless the @ is at the start or preceded by whitespace, so
 * typing an email address never opens the @ autocomplete. */
export function activeMention(value: string, caret: number): { start: number; typed: string } | null {
  const before = value.slice(0, caret)
  const m = /@([a-zA-Z]*)$/.exec(before)
  if (!m) return null
  // Must be at start or preceded by whitespace.
  const at = before.length - m[0].length
  if (at > 0 && !/\s/.test(before[at - 1])) return null
  return { start: at, typed: m[1] ?? '' }
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
