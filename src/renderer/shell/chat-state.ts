import type { AgentEvent } from '../../shared/agent.js'

export type ChatToolStatus = 'running' | 'done' | 'needs-approval' | 'approved' | 'denied'

export interface ChatToolActivity {
  callId: string
  name: string
  status: ChatToolStatus
}

export interface ChatApproval {
  approvalId: string
  toolCallId: string
  toolName: string
  input: unknown
  reason?: string
}

export interface ChatRunState {
  runId: string
  text: string
  tools: ChatToolActivity[]
  approvals: ChatApproval[]
  phase: 'running' | 'done' | 'error' | 'aborted'
  error?: string
}

export function createChatRunState(runId: string): ChatRunState {
  return { runId, text: '', tools: [], approvals: [], phase: 'running' }
}

export function reduceChatRun(state: ChatRunState, event: AgentEvent): ChatRunState {
  if (event.runId !== state.runId) return state
  switch (event.type) {
    case 'text-delta':
      return { ...state, text: state.text + event.delta }
    case 'tool-call':
      return upsertTool(state, event.toolCallId, event.toolName, 'running')
    case 'tool-result':
      return upsertTool(state, event.toolCallId, event.toolName, 'done')
    case 'approval-requested':
      return {
        ...upsertTool(state, event.toolCallId, event.toolName, 'needs-approval'),
        approvals: [
          ...state.approvals,
          {
            approvalId: event.approvalId,
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            input: event.input,
            ...(event.reason ? { reason: event.reason } : {})
          }
        ]
      }
    case 'done':
      return { ...state, text: event.text || state.text, phase: 'done' }
    case 'error':
      return { ...state, phase: 'error', error: event.message }
    case 'aborted':
      return { ...state, phase: 'aborted' }
  }
}

export function resolveChatApproval(state: ChatRunState, approvalId: string, approved: boolean): ChatRunState {
  const approval = state.approvals.find((item) => item.approvalId === approvalId)
  if (!approval) return state
  return {
    ...upsertTool(state, approval.toolCallId, approval.toolName, approved ? 'approved' : 'denied'),
    approvals: state.approvals.filter((item) => item.approvalId !== approvalId)
  }
}

function upsertTool(
  state: ChatRunState,
  callId: string,
  name: string,
  status: ChatToolStatus
): ChatRunState {
  const index = state.tools.findIndex((tool) => tool.callId === callId)
  const tools = [...state.tools]
  const activity = { callId, name, status }
  if (index < 0) tools.push(activity)
  else tools[index] = activity
  return { ...state, tools }
}
