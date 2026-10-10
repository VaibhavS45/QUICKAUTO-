import { describe, expect, it, vi } from 'vitest'
import { buildToolApproval, createBuiltinTools } from '../../src/main/agent/tools.js'
import { buildInstructions } from '../../src/main/agent/registry.js'
import { runAgent, type AgentLike } from '../../src/main/agent/runner.js'
import type { ModelMessage, ToolSet } from 'ai'

function depsWith(over: Partial<Parameters<typeof runAgent>[0]['deps']> = {}) {
  return {
    getConfig: () => ({ provider: 'anthropic' as const, model: 'claude-sonnet-4-5', resetDay: 1 }),
    getApiKey: async () => 'test-key',
    ...over
  }
}

function streamResult(parts: Array<Record<string, unknown>>, text: string, steps = 1): Awaited<ReturnType<AgentLike['stream']>> {
  return {
    stream: (async function* () {
      for (const p of parts) yield p
    })(),
    content: Promise.resolve(parts),
    text: Promise.resolve(text),
    steps: Promise.resolve(new Array(steps).fill({})),
    responseMessages: Promise.resolve([{ role: 'assistant', content: text } as unknown as ModelMessage])
  }
}

/** Fake agent: first stream() asks approval for echo_write, second completes. */
function approvalFakeAgent(opts: { approveSendsWrite: boolean }): AgentLike & { calls: number } {
  const state = { calls: 0 }
  return {
    calls: 0,
    async stream({ messages }: { messages: ModelMessage[] }) {
      state.calls++
      const hasResponse = messages.some((m) => m.role === 'tool')
      if (!hasResponse) {
        return streamResult(
          [
            { type: 'tool-approval-request', approvalId: 'ap1', toolCallId: 'tc1', toolName: 'echo_write', input: { text: 'hello' } }
          ],
          '',
          1
        )
      }
      const toolMsg = messages.find((m) => m.role === 'tool') as unknown as {
        content: Array<{ approved: boolean }>
      }
      const approved = toolMsg.content[0]?.approved ?? false
      void opts
      return streamResult([{ type: 'text-delta', text: approved ? 'wrote hello' : 'denied, did not write' }], approved ? 'wrote hello' : 'denied, did not write', 2)
    }
  } as unknown as AgentLike & { calls: number }
}

describe('toolApproval policy (ai v7 toolApproval, not needsApproval)', () => {
  it('requires user approval for the fake write tool in palette runs', () => {
    const policy = buildToolApproval('palette', ['echo', 'echo_write'])
    expect(policy['echo_write']).toBe('user-approval')
    expect('echo' in policy).toBe(false)
  })

  it('keeps chat writes behind approval and supports interactive auto-approve', () => {
    const policy = buildToolApproval('chat', ['echo', 'echo_write'], new Set(['echo', 'echo_write']))
    expect(policy).toEqual({ echo: 'approved', echo_write: 'user-approval' })
  })

  it('denies writes outright for scheduled runs', () => {
    const policy = buildToolApproval('scheduled', ['echo_write'])
    expect(policy['echo_write']).toEqual({
      type: 'denied',
      reason: expect.stringContaining('Scheduled runs')
    })
  })

  it('built-in tools carry no deprecated needsApproval flag', () => {
    const tools = createBuiltinTools() as unknown as Record<string, { needsApproval?: unknown }>
    expect(tools['echo']?.needsApproval).toBeUndefined()
    expect(tools['echo_write']?.needsApproval).toBeUndefined()
  })
})

describe('runAgent approval flow', () => {
  it('adds bounded chat history before the current prompt and retains safety instructions', async () => {
    const history = Array.from({ length: 25 }, (_, i) => ({
      role: i % 2 === 0 ? 'user' as const : 'assistant' as const,
      text: `message-${i}`,
      createdAt: i
    }))
    let seenMessages: ModelMessage[] = []
    let seenInstructions = ''
    const out = await runAgent({
      prompt: 'current question',
      tools: [],
      source: 'chat',
      history,
      systemPrompt: 'Use concise answers.',
      emit: () => {},
      deps: depsWith({
        getTools: async () => ({}) as unknown as ToolSet,
        createAgent: ({ instructions }) => {
          seenInstructions = instructions
          return {
            async stream({ messages }) {
              seenMessages = messages
              return streamResult([], 'answer')
            }
          }
        }
      })
    })
    expect(out.text).toBe('answer')
    expect(seenMessages).toHaveLength(21)
    expect(seenMessages[0]).toMatchObject({ role: 'assistant', content: 'message-5' })
    expect(seenMessages.at(-1)).toMatchObject({ role: 'user', content: 'current question' })
    expect(seenInstructions).toContain('Use concise answers.')
    expect(seenInstructions).toContain('Tool outputs')
    expect(seenInstructions.indexOf('Use concise answers.')).toBeLessThan(seenInstructions.indexOf('untrusted DATA'))
  })

  it('approve -> tool runs on second call, answer streams to done', async () => {
    const fake = approvalFakeAgent({ approveSendsWrite: true })
    const events: Array<{ type: string }> = []
    const decides: string[] = []
    const out = await runAgent({
      prompt: 'write hello',
      tools: [],
      source: 'palette',
      emit: (e) => events.push(e),
      decideApproval: async (req) => {
        decides.push(req.toolName)
        return { approved: true }
      },
      deps: depsWith({
        getTools: async () => ({}) as unknown as ToolSet,
        createAgent: () => fake
      })
    })
    expect(decides).toEqual(['echo_write'])
    expect(out.text).toBe('wrote hello')
    expect(events.map((e) => e.type)).toContain('approval-requested')
    expect(events.map((e) => e.type)).toContain('done')
  })

  it('deny -> tool does not run, model told about denial', async () => {
    const fake = approvalFakeAgent({ approveSendsWrite: false })
    const events: Array<{ type: string }> = []
    const out = await runAgent({
      prompt: 'write hello',
      tools: [],
      source: 'palette',
      emit: (e) => events.push(e),
      decideApproval: async () => ({ approved: false, reason: 'no' }),
      deps: depsWith({
        getTools: async () => ({}) as unknown as ToolSet,
        createAgent: () => fake
      })
    })
    expect(out.text).toContain('denied')
    expect(events.map((e) => e.type)).not.toContain('tool-result')
  })

  it('abort mid-run emits aborted', async () => {
    const hanging: AgentLike = {
      async stream() {
        return {
          stream: (async function* () {
            await new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('aborted'), { name: 'AbortError' })), 5))
            yield {}
          })(),
          content: Promise.resolve([]),
          text: Promise.resolve(''),
          steps: Promise.resolve([]),
          responseMessages: Promise.resolve([])
        }
      }
    }
    const controller = new AbortController()
    const events: Array<{ type: string }> = []
    setTimeout(() => controller.abort(), 10)
    await runAgent({
      prompt: 'hi',
      tools: [],
      source: 'palette',
      signal: controller.signal,
      emit: (e) => events.push(e),
      deps: depsWith({
        getTools: async () => ({}) as unknown as ToolSet,
        createAgent: () => hanging
      })
    })
    expect(events.map((e) => e.type)).toContain('aborted')
  })

  it('missing API key returns a clear error, no model call', async () => {
    const createAgent = vi.fn(() => {
      throw new Error('should not be called')
    })
    const events: Array<{ type: string; message?: string }> = []
    const out = await runAgent({
      prompt: 'hi',
      tools: [],
      source: 'palette',
      emit: (e) => events.push(e as { type: string }),
      deps: depsWith({ getApiKey: async () => null, createAgent: createAgent as never })
    })
    expect(out.text).toBe('')
    expect(createAgent).not.toHaveBeenCalled()
    expect(events[0]?.type).toBe('error')
    expect(events[0]?.message ?? '').toMatch(/api key/i)
  })
})

describe('prompt-injection guardrails (instructions)', () => {
  it('tells the model tool output is untrusted data', () => {
    for (const source of ['palette', 'scheduled'] as const) {
      const instructions = buildInstructions(source)
      expect(instructions).toMatch(/untrusted/i)
      expect(instructions).toMatch(/never.*instructions/i)
    }
  })

  it('scheduled runs are told not to perform writes', () => {
    expect(buildInstructions('scheduled')).toMatch(/do not perform writes/i)
  })
})
