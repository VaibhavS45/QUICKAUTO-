import { describe, expect, it } from 'vitest'
import { runAgent, type RunnerDeps, type AgentLike } from '../../src/main/agent/runner.js'
import { getRunContext } from '../../src/main/agent/run-context.js'
import type { ModelMessage } from 'ai'

type StreamReturn = Awaited<ReturnType<AgentLike['stream']>>

function streamFac(over: { parts: () => Array<Record<string, unknown>> }): StreamReturn {
  return {
    stream: (async function* () {
      for (const part of over.parts()) yield part
    })(),
    content: Promise.resolve([]),
    text: Promise.resolve('ok'),
    steps: Promise.resolve([{}]),
    responseMessages: Promise.resolve([] as ModelMessage[])
  } as StreamReturn
}

/**
 * Two-pass fake run:
 * pass 1 — emits untrusted tool activity + a manual approval request
 * pass 2 — clean stream (the loop re-enters after the approval round)
 */
function depsTwoPass(untrustedToolName: string, marks: boolean[]): RunnerDeps {
  let pass = 0
  return {
    getConfig: () => ({ provider: 'openai', model: 'm' }) as never,
    getApiKey: async () => 'k',
    createAgent: () =>
      ({
        stream: async () => {
          marks.push(getRunContext()?.untrustedIngested === true)
          pass += 1
          if (pass === 1) {
            const first = streamFac({
              parts: () => [
                {
                  type: 'tool-call',
                  toolCall: { toolCallId: 't1', toolName: untrustedToolName, input: {} }
                }
              ]
            })
            return {
              stream: first.stream,
              content: Promise.resolve([
                { type: 'tool-approval-request', approvalId: 'a1', toolCallId: 't1', toolName: untrustedToolName, input: {} }
              ]) as never,
              text: Promise.resolve('') as never,
              steps: Promise.resolve([{}]) as never,
              responseMessages: Promise.resolve([] as ModelMessage[]) as never
            } as StreamReturn
          }
          return streamFac({ parts: () => [] })
        }
      }) as never
  }
}

async function run(untrustedToolName: string): Promise<boolean[]> {
  const marks: boolean[] = []
  await runAgent({
    prompt: 'hello',
    tools: [],
    source: 'chat',
    runId: 'untrusted',
    emit: () => {},
    decideApproval: async () => ({ approved: false }),
    deps: depsTwoPass(untrustedToolName, marks)
  })
  return marks
}

describe('runner flags untrusted ingestion from tool activity', () => {
  it('sets untrustedIngested after a web_search tool call', async () => {
    expect(await run('web_search')).toEqual([false, true])
  })

  it('sets it for mcp tools too', async () => {
    expect(await run('mcp_custom_fetch')).toEqual([false, true])
  })

  it('stays false for harmless tools', async () => {
    expect(await run('read_file')).toEqual([false, false])
  })
})
