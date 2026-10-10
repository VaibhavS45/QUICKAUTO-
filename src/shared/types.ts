/** Canonical @ tool ids. Aliases resolved in parseMentionedTools. */
export const TOOL_IDS = [
  'websearch',
  'notion',
  'gmail',
  'sheets',
  'opencode',
  'github',
  'files',
  'mcp'
] as const

export type ActiveToolId = (typeof TOOL_IDS)[number]
/** @deprecated Scheduler's legacy directive only; it is not an agent tool. */
export type LegacyScheduleDirective = 'calendar'
export type ToolId = ActiveToolId | LegacyScheduleDirective

export const TOOL_ALIASES: Record<string, ActiveToolId> = {
  email: 'gmail',
  sheet: 'sheets'
}

export const TOOL_META: Record<ActiveToolId, { label: string; hint: string }> = {
  websearch: { label: '@websearch', hint: 'Search the web and optionally save a summary' },
  notion: { label: '@notion', hint: 'Notion via Composio (M3)' },
  gmail: { label: '@gmail', hint: 'Gmail via Composio (read-only) — alias @email' },
  sheets: { label: '@sheets', hint: 'Sheets via Composio (M3) — alias @sheet' },
  opencode: { label: '@opencode', hint: 'Coding agent (M5)' },
  github: { label: '@github', hint: 'PR reviews via local gh CLI (read-only)' },
  files: { label: '@files', hint: 'Local files in granted folders (M2)' },
  mcp: { label: '@mcp', hint: 'Tools from MCP servers started in Settings → MCP' }
}

/** Extract @mentions from free text, resolving aliases.
 * An @ only counts at the start of the text or after whitespace, so email
 * addresses (me@gmail.com) and handles (a@b) never count as mentions. */
export function parseMentionedTools(text: string): ToolId[] {
  const found: ToolId[] = []
  const re = /(?:^|\s)@([a-zA-Z]+)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const raw = m[1].toLowerCase()
    let id: ActiveToolId | undefined
    if ((TOOL_IDS as readonly string[]).includes(raw)) id = raw as ActiveToolId
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
