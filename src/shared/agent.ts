import { z } from 'zod'
import { ChatMessageSchema } from './chat.js'

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

const AgentEventBase = { runId: z.string().min(1).max(128) }
export const AgentEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('text-delta'), ...AgentEventBase, delta: z.string() }).strict(),
  z.object({
    type: z.literal('tool-call'),
    ...AgentEventBase,
    toolCallId: z.string(),
    toolName: z.string(),
    input: z.unknown()
  }).strict(),
  z.object({
    type: z.literal('tool-result'),
    ...AgentEventBase,
    toolCallId: z.string(),
    toolName: z.string(),
    output: z.unknown()
  }).strict(),
  z.object({
    type: z.literal('approval-requested'),
    ...AgentEventBase,
    approvalId: z.string(),
    toolCallId: z.string(),
    toolName: z.string(),
    input: z.unknown(),
    reason: z.string().optional()
  }).strict(),
  z.object({ type: z.literal('done'), ...AgentEventBase, text: z.string(), steps: z.number().int().nonnegative() }).strict(),
  z.object({ type: z.literal('error'), ...AgentEventBase, message: z.string() }).strict(),
  z.object({ type: z.literal('aborted'), ...AgentEventBase }).strict()
])

export const AgentRunRequestSchema = z.object({
  prompt: z.string().min(1).max(20000),
  tools: z.array(z.string()).max(16),
  source: RunSourceSchema,
  chatId: z.string().min(1).max(128).optional(),
  history: z.array(ChatMessageSchema).max(20).optional(),
  systemPrompt: z.string().max(12000).optional()
})
export type AgentRunRequest = z.infer<typeof AgentRunRequestSchema>

export const AgentApprovalResponseSchema = z.object({
  runId: z.string().min(1).max(128),
  approvalId: z.string().min(1).max(256),
  approved: z.boolean(),
  reason: z.string().max(2000).optional()
})
export type AgentApprovalResponse = z.infer<typeof AgentApprovalResponseSchema>
