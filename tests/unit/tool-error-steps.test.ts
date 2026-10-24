import { describe, expect, it } from 'vitest'
import { runAgent, type AgentLike, type RunnerDeps } from '../../src/main/agent/runner.js'
import type { AgentEvent } from '../../src/shared/agent.js'
import type { ModelMessage } from 'ai'

type StreamReturn = Awaited<ReturnType<AgentLike['stream']>>

function fakeResult(parts: Array<Record<string, unknown>>): StreamReturn {
  return {
    stream: (async function* () {
      for (const part of parts) yield part
    })(),
    content: Promise.resolve([]),
    text: Promise.resolve('ok'),
    steps: Promise.resolve([{}]),
    responseMessages: Promise.resolve([] as ModelMessage[])
  } as StreamReturn
}

function deps(parts: Array<Record<string, unknown>>): RunnerDeps {
  return {
    getConfig: () => ({ provider: 'openai', model: 'm' }) as never,
    getApiKey: async () => 'k',
    createAgent: () =>
      ({
        stream: async () => fakeResult(parts)
      }) as never
  }
}

async function runOnce(parts: Array<Record<string, unknown>>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = []
  await runAgent({
    prompt: 'use the file',
    tools: [],
    source: 'chat',
    runId: 'tool-err',
    emit: (e) => events.push(e),
    deps: deps(parts)
  })
  return events
}

describe('tool errors are surfaced as run-log steps (W9)', () => {
  it('emits a tool-error event with toolName and message on tool-error parts', async () => {
    const events = await runOnce([
      { type: 'tool-error', toolCallId: 'tc1', toolName: 'fallback_tool', errorText: '_KINDA_ permission denied' }
    ])
    const err = events.find((e): e is Extract<AgentEvent, { type: 'tool-error' }> => e.type === 'tool-error')
    expect(err).toBeDefined()
    expect(err?.toolName).toBe('fallback_tool')
    expect(err?.toolCallId).toBe('tc1')
    expect(err?.message).toContain('permission denied')
  })

  it('falls back to stringify and unknown names when the part omits fields', async () => {
    const events = await runOnce([{ type: 'tool-error', error: 'boom' }])
    const err = events.find((e): e is Extract<AgentEvent, { type: 'tool-error' }> => e.type === 'tool-error')
    expect(err?.toolName).toBe('unknown')
    expect(err?.message).toContain('boom')
  })

  it('does not affect ordinary runs (control)', async () => {
    const events = await runOnce([
      { type: 'tool-result', toolResult: { toolCallId: 't', toolName: 'echo', output: { ok: true } } }
    ])
    expect(events.some((e) => e.type === 'tool-error')).toBe(false)
    expect(events.some((e) => e.type === 'tool-result')).toBe(true)
  })
})
