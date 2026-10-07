import { getRunContext } from './run-context.js'

/**
 * Nested (in-tool) approval bridge. Long-running tool executes — e.g. the
 * OpenCode conflict resolver asking a permission mid-run — cannot use the
 * agent-level `toolApproval` round-trip (that only gates whole tool calls).
 * Instead they call requestNestedApproval(), which the main process wires to
 * the same in-app approve/deny card + agent:approval IPC channel as ordinary
 * approvals. Denied when no handler is wired (fail-closed) or the run ends.
 */

export interface NestedApprovalRequest {
  runId: string
  toolName: string
  input: unknown
  reason?: string
}

export interface NestedApprovalDecision {
  approved: boolean
  reason?: string
}

type NestedApprovalHandler = (req: NestedApprovalRequest) => Promise<NestedApprovalDecision>

let handler: NestedApprovalHandler | null = null
let counter = 0

export function setNestedApprovalHandler(h: NestedApprovalHandler | null): void {
  handler = h
}

export function nextNestedApprovalId(): string {
  counter += 1
  return `nested-${Date.now().toString(36)}-${counter}`
}

export async function requestNestedApproval(req: Omit<NestedApprovalRequest, 'runId'> & { runId?: string }): Promise<NestedApprovalDecision> {
  if (!handler || !req.runId) {
    return { approved: false, reason: 'No approval handler; denied by default.' }
  }
  return handler({ runId: req.runId, toolName: req.toolName, input: req.input, reason: req.reason })
}

/** Same, with runId taken from the current agent run context. */
export async function requestNestedApprovalForCurrentRun(req: {
  toolName: string
  input: unknown
  reason?: string
}): Promise<NestedApprovalDecision> {
  return requestNestedApproval({ ...req, runId: getRunContext()?.runId })
}
