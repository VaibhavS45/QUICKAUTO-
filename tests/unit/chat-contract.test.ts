import { describe, expect, it } from 'vitest'
import { AgentEventSchema, AgentRunRequestSchema } from '../../src/shared/agent.js'
import { ChatMessageSchema, ChatThreadSchema, MAX_HISTORY_MESSAGES } from '../../src/shared/chat.js'

describe('chat contracts', () => {
  it('validates user/assistant messages and thread data', () => {
    const message = { role: 'user', text: 'Hello', createdAt: 1 }
    expect(ChatMessageSchema.safeParse(message).success).toBe(true)
    expect(ChatMessageSchema.safeParse({ ...message, role: 'system' }).success).toBe(false)
    expect(ChatThreadSchema.safeParse({
      id: 'thread-1',
      title: 'Hello',
      createdAt: 1,
      updatedAt: 1,
      messages: [message]
    }).success).toBe(true)
  })

  it('supports optional agent history and system prompts but caps history at 20', () => {
    const base = { prompt: 'Now', tools: [], source: 'chat' as const }
    const history = Array.from({ length: MAX_HISTORY_MESSAGES }, (_, i) => ({
      role: 'user' as const,
      text: `before-${i}`,
      createdAt: i
    }))
    expect(AgentRunRequestSchema.safeParse(base).success).toBe(true)
    expect(AgentRunRequestSchema.safeParse({ ...base, history, systemPrompt: 'Be concise.' }).success).toBe(true)
    expect(AgentRunRequestSchema.safeParse({
      ...base,
      history: [...history, { role: 'user', text: 'extra', createdAt: 21 }]
    }).success).toBe(false)
  })

  it('validates events pushed from main to the renderer', () => {
    expect(AgentEventSchema.safeParse({
      type: 'approval-requested',
      runId: 'run-1',
      approvalId: 'approval-1',
      toolCallId: 'tool-1',
      toolName: 'gmail_send',
      input: { to: 'person@example.com' }
    }).success).toBe(true)
    expect(AgentEventSchema.safeParse({ type: 'done', runId: 'run-1', text: '', steps: -1 }).success).toBe(false)
  })
})
