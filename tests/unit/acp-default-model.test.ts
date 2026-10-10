import { describe, expect, it } from 'vitest'
import { runAgent } from '../../src/main/agent/runner.js'
import { DEFAULT_ACP_MODEL } from '../../src/main/agent/agent-provider.js'
import type { AgentEvent } from '../../src/shared/agent.js'

function harnessDeps(acpModel: string | null, seen: { model?: string }) {
  return {
    getConfig: () => ({ provider: 'anthropic', model: 'x' }) as never,
    getApiKey: async () => null,
    getAgentProvider: () => 'opencode' as const,
    getHarnessDirectory: () => '/tmp',
    getAcpModel: () => acpModel,
    runAcp: async (req: { model?: string }) => {
      seen.model = req.model
      return { text: 'ok', steps: 1 }
    }
  }
}

describe('ACP free-model default', () => {
  it('sends the Zed-compatible OpenCode Zen free model when no model was picked', async () => {
    const seen: { model?: string } = {}
    const events: AgentEvent[] = []
    await runAgent({
      prompt: 'hi',
      tools: [],
      source: 'chat',
      runId: 'r-free',
      emit: (e) => events.push(e),
      deps: harnessDeps(null, seen)
    })
    expect(seen.model).toBe(DEFAULT_ACP_MODEL)
    expect(events.at(-1)).toMatchObject({ type: 'done' })
  })

  it('keeps an explicit picker choice', async () => {
    const seen: { model?: string } = {}
    await runAgent({
      prompt: 'hi',
      tools: [],
      source: 'chat',
      runId: 'r-picked',
      emit: () => {},
      deps: harnessDeps('opencode/some-paid', seen)
    })
    expect(seen.model).toBe('opencode/some-paid')
  })
})
