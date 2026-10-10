import { describe, expect, it } from 'vitest'
import { createChatRunState, reduceChatRun, resolveChatApproval } from '../../src/renderer/shell/chat-state.js'

describe('chat run reducer', () => {
  it('streams text and tracks tool-call progress', () => {
    let state = createChatRunState('r1')
    state = reduceChatRun(state, { type: 'text-delta', runId: 'r1', delta: 'Hello ' })
    state = reduceChatRun(state, { type: 'tool-call', runId: 'r1', toolCallId: 'tc1', toolName: 'gmail_search', input: {} })
    state = reduceChatRun(state, { type: 'tool-result', runId: 'r1', toolCallId: 'tc1', toolName: 'gmail_search', output: {} })
    state = reduceChatRun(state, { type: 'done', runId: 'r1', text: 'Hello world', steps: 2 })
    expect(state.text).toBe('Hello world')
    expect(state.tools).toEqual([{ callId: 'tc1', name: 'gmail_search', status: 'done' }])
    expect(state.phase).toBe('done')
  })

  it('holds approval requests until the user approves or denies them', () => {
    let state = createChatRunState('r1')
    state = reduceChatRun(state, {
      type: 'approval-requested',
      runId: 'r1',
      approvalId: 'ap1',
      toolCallId: 'tc1',
      toolName: 'gmail_send',
      input: { to: 'person@example.com' },
      reason: 'Send this email?'
    })
    expect(state.tools[0]?.status).toBe('needs-approval')
    expect(state.approvals).toHaveLength(1)
    state = resolveChatApproval(state, 'ap1', false)
    expect(state.approvals).toEqual([])
    expect(state.tools[0]?.status).toBe('denied')
    expect(resolveChatApproval(state, 'missing', true)).toBe(state)
  })

  it('ignores events from a different run and records failure/cancel states', () => {
    const initial = createChatRunState('r1')
    expect(reduceChatRun(initial, { type: 'text-delta', runId: 'r2', delta: 'wrong run' })).toBe(initial)
    expect(reduceChatRun(initial, { type: 'error', runId: 'r1', message: 'Budget exhausted' })).toMatchObject({
      phase: 'error',
      error: 'Budget exhausted'
    })
    expect(reduceChatRun(initial, { type: 'aborted', runId: 'r1' }).phase).toBe('aborted')
  })
})
