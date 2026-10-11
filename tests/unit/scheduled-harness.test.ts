import { describe, expect, it } from 'vitest'
import { runAgent } from '../../src/main/agent/runner.js'
import type { AgentEvent } from '../../src/shared/agent.js'

interface Seen {
  prompt?: string
  onPermission?: (perm: never) => Promise<boolean>
  piCalled?: boolean
}

function scheduledDeps(seen: Seen, provider: 'opencode' | 'pi') {
  return {
    getConfig: () => ({ provider: 'anthropic', model: 'x' }) as never,
    getApiKey: async () => null,
    getAgentProvider: () => provider,
    getHarnessDirectory: () => '/tmp',
    getAcpModel: () => null,
    runAcp: async (req: { prompt: string; onPermission?: (perm: never) => Promise<boolean> }) => {
      seen.prompt = req.prompt
      seen.onPermission = req.onPermission
      return { text: 'scheduled-ok', steps: 2 }
    },
    runPi: async () => {
      seen.piCalled = true
      return { text: 'pi', steps: 1 }
    }
  }
}

function runScheduled(provider: 'opencode' | 'pi', seen: Seen, extra: Record<string, unknown> = {}) {
  const events: AgentEvent[] = []
  return runAgent({
    prompt: 'Every day at 9am summarize the news',
    tools: [],
    source: 'scheduled',
    runId: `sched-${provider}`,
    emit: (e) => events.push(e),
    decideApproval: async () => ({ approved: true, reason: 'ui' }),
    deps: scheduledDeps(seen, provider),
    ...extra
  }).then((out) => ({ out, events }))
}

describe('scheduled runs on the opencode harness', () => {
  it('routes scheduled runs through opencode ACP without an API key', async () => {
    const seen: Seen = {}
    const { out, events } = await runScheduled('opencode', seen)
    expect(seen.prompt).toContain('summarize the news')
    expect(out).toMatchObject({ text: 'scheduled-ok', steps: 2 })
    expect(events.at(-1)).toMatchObject({ type: 'done' })
  })

  it('keeps the scheduled read-only framing in the harness prompt', async () => {
    const seen: Seen = {}
    await runScheduled('opencode', seen)
    expect(seen.prompt).toContain('scheduled run: do not perform writes')
  })

  it('denies ACP permissions on scheduled runs even when the UI would approve', async () => {
    const seen: Seen = {}
    await runScheduled('opencode', seen)
    expect(seen.onPermission).toBeTypeOf('function')
    await expect(seen.onPermission!({} as never)).resolves.toBe(false)
  })

  it('keeps pi off scheduled runs (no permission protocol)', async () => {
    const seen: Seen = {}
    const { events } = await runScheduled('pi', seen)
    expect(seen.piCalled).toBeUndefined()
    expect(events.at(-1)).toMatchObject({ type: 'error' })
  })
})
