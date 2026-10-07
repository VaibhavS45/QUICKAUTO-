import type { ToolSet } from 'ai'
import type { ToolId } from '../../shared/types.js'

/**
 * ConnectorProvider — implemented once per backend (built-in tools, Composio,
 * gh CLI, ...). The agent registry asks providers for tools by @mention id.
 */
export interface ToolStatus {
  connected: boolean
  /** Human-readable detail, e.g. "signed in as x@y" or "run: gh auth login". */
  detail?: string
}

export interface ConnectorProvider {
  /** Stable id, e.g. 'builtin', 'composio', 'github-cli'. */
  readonly id: string
  /** Tools for the given @mention ids. Unknown ids are ignored. */
  getTools(toolIds: ToolId[]): Promise<ToolSet> | ToolSet
  /** Connection status for one @mention id. */
  status(toolId: ToolId): Promise<ToolStatus> | ToolStatus
  /** Start connecting (e.g. open auth URL). Resolves when kicked off. */
  connect(toolId: ToolId): Promise<{ ok: boolean; url?: string; error?: string }>
}
