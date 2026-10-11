import type { AutomationTemplate } from '../../shared/contracts/automation-templates.js'
import { TOOL_META } from '../../shared/types.js'

export type RequirementState = 'ready' | 'connect' | 'unavailable' | 'unknown'

export interface RequirementBadge {
  id: string
  label: string
  state: RequirementState
}

const UNAVAILABLE_TOOLS = new Set(['opencode'])
const LOCAL_TOOLS = new Set(['files'])
const LABELS: Record<string, string> = {
  websearch: 'Web search',
  notion: 'Notion',
  gmail: 'Gmail',
  sheets: 'Google Sheets',
  github: 'GitHub',
  files: 'Local file writes (approval required)',
  opencode: 'OpenCode',
  mcp: 'MCP servers'
}

export function toolDisplayLabel(id: string): string {
  return LABELS[id] ?? TOOL_META[id as keyof typeof TOOL_META]?.label ?? id
}

export function requirementState(
  id: string,
  connected: Readonly<Record<string, boolean | undefined>>
): RequirementState {
  if (UNAVAILABLE_TOOLS.has(id)) return 'unavailable'
  if (LOCAL_TOOLS.has(id)) return 'ready'
  if (connected[id] === true) return 'ready'
  if (connected[id] === false) return 'connect'
  return 'unknown'
}

export function templateRequirementBadges(
  template: AutomationTemplate,
  connected: Readonly<Record<string, boolean | undefined>>
): RequirementBadge[] {
  return template.requires.map((id) => ({
    id,
    label: toolDisplayLabel(id),
    state: requirementState(id, connected)
  }))
}
