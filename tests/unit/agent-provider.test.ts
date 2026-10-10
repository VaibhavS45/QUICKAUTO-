import { describe, expect, it } from 'vitest'
import {
  AgentProviderService,
  detectHarnesses,
  parseVersion
} from '../../src/main/agent/agent-provider.js'
import { foldPiEvent, piMessageText } from '../../src/main/agent/pi-run.js'

function memStore() {
  const data = new Map<string, unknown>()
  return {
    get: (k: string) => data.get(k),
    set: (k: string, v: unknown) => { data.set(k, v) }
  }
}

describe('AgentProviderService', () => {
  it('defaults to builtin and round-trips opencode/pi', () => {
    const svc = new AgentProviderService(memStore())
    expect(svc.get()).toBe('builtin')
    expect(svc.set('opencode')).toBe('opencode')
    expect(svc.get()).toBe('opencode')
    expect(svc.set('pi')).toBe('pi')
    expect(svc.get()).toBe('pi')
  })

  it('rejects unknown providers and falls back on corrupt state', () => {
    const svc = new AgentProviderService(memStore())
    expect(() => svc.set('nope')).toThrow()
    const store = memStore()
    store.set('agent-provider', '???')
    expect(new AgentProviderService(store).get()).toBe('builtin')
  })
})

describe('parseVersion', () => {
  it('pulls semver out of CLI banners', () => {
    expect(parseVersion('opencode v2.0.20\n')).toBe('2.0.20')
    expect(parseVersion('1.1.0')).toBe('1.1.0')
  })
})

describe('detectHarnesses', () => {
  it('reports installed + missing binaries without touching the network', async () => {
    const out = await detectHarnesses({
      run: async (bin) => {
        if (bin === 'opencode') return 'opencode v2.0.20\n'
        throw Object.assign(new Error('not found'), { code: 'ENOENT' })
      }
    })
    expect(out).toEqual([
      { id: 'opencode', installed: true, version: '2.0.20', detail: 'opencode 2.0.20 detected on PATH' },
      { id: 'pi', installed: false, detail: 'pi not found on PATH.' }
    ])
  })
})

describe('pi JSONL folding', () => {
  it('streams text deltas and ends with authoritative message text', () => {
    const seen: string[] = []
    const d = foldPiEvent({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: 'Hello ' } })
    for (const item of d.emit) if (item.kind === 'text' && item.text) seen.push(item.text)
    const end = foldPiEvent({ type: 'message_end', message: { role: 'assistant', content: [{ type: 'text', text: 'Hello world' }] } })
    expect(seen).toEqual(['Hello '])
    expect(end.finalText).toBe('Hello world')
  })

  it('maps tool execution start/end to tool-call/tool-result', () => {
    const start = foldPiEvent({ type: 'tool_execution_start', toolCallId: 'c1', toolName: 'bash', args: { command: 'ls' } })
    expect(start.emit[0]).toMatchObject({ kind: 'tool-call', toolCallId: 'c1', toolName: 'pi: bash' })
    const end = foldPiEvent({ type: 'tool_execution_end', toolCallId: 'c1', toolName: 'bash', result: { content: [] }, isError: false })
    expect(end.emit[0]).toMatchObject({ kind: 'tool-result', toolCallId: 'c1', toolName: 'pi: bash' })
  })

  it('ignores unknown events and reads string content', () => {
    expect(foldPiEvent({ type: 'agent_start' }).emit).toEqual([])
    expect(piMessageText({ content: 'plain' })).toBe('plain')
    expect(piMessageText({ content: [{ type: 'other' }] })).toBe('')
  })
})
