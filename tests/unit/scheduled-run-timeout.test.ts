import { describe, expect, it } from 'vitest'
import { runAgent, type RunnerDeps } from '../../src/main/agent/runner.js'

function hangingDeps(over: Partial<RunnerDeps> = {}): RunnerDeps {
  return {
    getConfig: () => ({ provider: 'openai', model: 'm' }) as never,
    getApiKey: async () => 'test-key',
    createAgent: () =>
      ({
        stream: () => new Promise<never>(() => {}) // provider hangs forever
      }) as never,
    ...over
  }
}

describe('W2: scheduled runs are time-bounded (builtin harness)', () => {
  it('rejects a hung scheduled run after the injected timeout', async () => {
    const outcome = await runAgent({
      prompt: 'websearch news',
      tools: [],
      source: 'scheduled',
      runId: 'run-timeout-1',
      emit: () => {},
      deps: hangingDeps({ scheduledTimeoutMs: 25 })
    }).then(
      () => 'resolved' as const,
      (err: unknown) => (err instanceof Error && /timed out/i.test(err.message) ? 'rejected-timeout' as const : 'rejected-other' as const)
    )
    expect(outcome).toBe('rejected-timeout')
  })

  it('does not bound interactive runs (chat) — control', async () => {
    let settled = false
    const pending = runAgent({
      prompt: 'hi',
      tools: [],
      source: 'chat',
      runId: 'run-timeout-2',
      emit: () => {},
      deps: hangingDeps({ scheduledTimeoutMs: 25 })
    }).then(() => { settled = true }, () => { settled = true })
    await new Promise((r) => setTimeout(r, 200))
    expect(settled).toBe(false)
    void pending
  }, 300)

  it('aborts the provider stream when the timeout fires (signal reaches the provider)', async () => {
    let providerSignal: AbortSignal | undefined
    const outcome = await runAgent({
      prompt: 'websearch news',
      tools: [],
      source: 'scheduled',
      runId: 'run-abort-1',
      emit: () => {},
      deps: hangingDeps({
        scheduledTimeoutMs: 25,
        createAgent: () =>
          ({
            stream: (args: { abortSignal?: AbortSignal }) => {
              providerSignal = args.abortSignal
              return new Promise<never>(() => {})
            }
          }) as never
      })
    }).then(
      () => 'resolved' as const,
      (err: unknown) => (err instanceof Error && /timed out/i.test(err.message) ? 'rejected-timeout' as const : 'rejected-other' as const)
    )
    expect(outcome).toBe('rejected-timeout')
    expect(providerSignal?.aborted).toBe(true)
  })

  it('a provider that honors abort short-circuits before the outer rejection', async () => {
    const events: string[] = []
    const res = await runAgent({
      prompt: 'websearch news',
      tools: [],
      source: 'scheduled',
      runId: 'run-abort-2',
      emit: (e) => { events.push(e.type) },
      deps: hangingDeps({
        scheduledTimeoutMs: 25,
        createAgent: () =>
          ({
            stream: (
              args: Parameters<import('../../src/main/agent/runner.js').AgentLike['stream']>[0]
            ) => {
              return new Promise<never>((_, reject) => {
                args.abortSignal?.addEventListener(
                  'abort',
                  () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })),
                  { once: true }
                )
              })
            }
          }) as never
      })
    })
    expect(res).toEqual({ text: '', steps: 0 })
    expect(events).toContain('aborted')
    expect(events).not.toContain('done')
  }, 500)
})
