import { describe, expect, it } from 'vitest'
import { runAgent, type RunnerDeps } from '../../src/main/agent/runner.js'
import type { EnsureOpencodeResult } from '../../src/main/agent/opencode-install.js'
import type { AgentEvent } from '../../src/shared/agent.js'

interface Seen {
  prompt?: string
  onPermission?: (perm: never) => Promise<boolean>
  piCalled?: boolean
  acpCalled?: boolean
}

function scheduledDeps(seen: Seen, provider: 'opencode' | 'pi') {
  return {
    getConfig: () => ({ provider: 'anthropic', model: 'x' }) as never,
    getApiKey: async () => null,
    getAgentProvider: () => provider,
    getHarnessDirectory: () => '/tmp',
    getAcpModel: () => null,
    ensureOpenCode: async () => ({ ok: true, binary: 'opencode' }),
    runAcp: async (req: { prompt: string; onPermission?: (perm: never) => Promise<boolean> }) => {
      seen.prompt = req.prompt
      seen.onPermission = req.onPermission
      seen.acpCalled = true
      return { text: 'scheduled-ok', steps: 2 }
    },
    runPi: async () => {
      seen.piCalled = true
      return { text: 'pi', steps: 1 }
    }
  }
}

function runScheduled(
  provider: 'opencode' | 'pi',
  seen: Seen,
  extraDeps: Partial<RunnerDeps> = {}
) {
  const events: AgentEvent[] = []
  return runAgent({
    prompt: 'Every day at 9am summarize the news',
    tools: [],
    source: 'scheduled',
    runId: `sched-${provider}`,
    emit: (e) => events.push(e),
    decideApproval: async () => ({ approved: true, reason: 'ui' }),
    deps: { ...scheduledDeps(seen, provider), ...extraDeps }
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

describe('opencode readiness on scheduled + manual test runs', () => {
  // Both the timer and the Scheduled Tasks "run now" path call runAgent with
  // source 'scheduled', so readiness is asserted on that single choke point.
  function withReady(ensureOpenCode: () => Promise<EnsureOpencodeResult>): Partial<RunnerDeps> {
    return { ensureOpenCode }
  }

  it('prepares the harness (installing when missing) before the ACP run', async () => {
    const seen: Seen = {}
    let ensured = 0
    const { out } = await runScheduled(
      'opencode',
      seen,
      withReady(async () => {
        ensured += 1
        return { ok: true, binary: '/home/me/.opencode/bin/opencode', installedNow: true }
      })
    )
    expect(ensured).toBe(1)
    expect(seen.acpCalled).toBe(true)
    expect(out).toMatchObject({ text: 'scheduled-ok', steps: 2 })
  })

  it('fails the run with the install error instead of spawning without a binary', async () => {
    const seen: Seen = {}
    const { events } = await runScheduled(
      'opencode',
      seen,
      withReady(async () => ({ ok: false, error: 'OpenCode install failed: offline' }))
    )
    expect(seen.acpCalled).toBeUndefined()
    expect(events.at(-1)).toMatchObject({ type: 'error', message: 'OpenCode install failed: offline' })
  })
})
