import { z } from 'zod'

/** Where an agent run originated. Scheduled runs get stricter budget/approval rules. */
export const RunSourceSchema = z.enum(['palette', 'chat', 'scheduled'])
export type RunSource = z.infer<typeof RunSourceSchema>

/** Events streamed from main -> renderer during an agent run. */
export type AgentEvent =
  | { type: 'text-delta'; runId: string; delta: string }
  | { type: 'tool-call'; runId: string; toolCallId: string; toolName: string; input: unknown }
  | { type: 'tool-result'; runId: string; toolCallId: string; toolName: string; output: unknown }
  | {
      type: 'approval-requested'
      runId: string
      approvalId: string
      toolCallId: string
      toolName: string
      input: unknown
      reason?: string
    }
  | { type: 'done'; runId: string; text: string; steps: number }
  | { type: 'error'; runId: string; message: string }
  | { type: 'aborted'; runId: string }

export const AgentRunRequestSchema = z.object({
  prompt: z.string().min(1).max(20000),
  tools: z.array(z.string()).max(16),
  source: RunSourceSchema
})
export type AgentRunRequest = z.infer<typeof AgentRunRequestSchema>

export const AgentApprovalResponseSchema = z.object({
  runId: z.string().min(1).max(128),
  approvalId: z.string().min(1).max(256),
  approved: z.boolean(),
  reason: z.string().max(2000).optional()
})
export type AgentApprovalResponse = z.infer<typeof AgentApprovalResponseSchema>
