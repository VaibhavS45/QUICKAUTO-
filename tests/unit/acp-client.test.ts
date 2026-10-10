import { EventEmitter } from 'node:events'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  acpContentText,
  flattenConfigOptions,
  foldAcpUpdate,
  listAcpModels,
  pickPermissionOption,
  runAcpPrompt
} from '../../src/main/agent/acp-client.js'
import type { AgentEvent } from '../../src/shared/agent.js'

describe('acpContentText', () => {
  it('reads text blocks and formats diffs', () => {
    expect(acpContentText({ type: 'text', text: 'hi' })).toBe('hi')
    expect(acpContentText({ type: 'diff', path: '/t/a.ts', oldText: null, newText: 'x' })).toContain('new file /t/a.ts')
    expect(acpContentText({ type: 'diff', path: '/t/a.ts', oldText: 'a', newText: 'b' })).toContain('diff /t/a.ts')
    expect(acpContentText({ type: 'terminal', terminalId: 't1' })).toBe('[terminal t1]')
    expect(acpContentText({ type: 'image' })).toBe('')
    expect(acpContentText(null)).toBe('')
  })
})

describe('foldAcpUpdate', () => {
  it('streams message chunks as text', () => {
    expect(foldAcpUpdate({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'hello' } })).toEqual([
      { kind: 'text', text: 'hello' }
    ])
    expect(foldAcpUpdate({ sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'hmm' } })).toEqual([
      { kind: 'text', text: 'hmm' }
    ])
    expect(foldAcpUpdate({ sessionUpdate: 'agent_message_chunk', content: { type: 'image' } })).toEqual([])
  })

  it('maps tool calls and completions, ignores in-progress', () => {
    expect(
      foldAcpUpdate({ sessionUpdate: 'tool_call', toolCallId: 'c1', name: 'read', title: 'Read f', rawInput: { a: 1 } })
    ).toEqual([{ kind: 'tool-call', toolCallId: 'c1', toolName: 'opencode: read', input: { a: 1 } }])
    expect(
      foldAcpUpdate({
        sessionUpdate: 'tool_call_update',
        toolCallId: 'c1',
        name: 'read',
        status: 'completed',
        content: [{ type: 'content', content: { type: 'text', text: 'done' } }]
      })
    ).toEqual([{ kind: 'tool-result', toolCallId: 'c1', toolName: 'opencode: read', output: 'done' }])
    expect(foldAcpUpdate({ sessionUpdate: 'tool_call_update', toolCallId: 'c1', status: 'in_progress' })).toEqual([])
    expect(foldAcpUpdate({ sessionUpdate: 'tool_call_update', toolCallId: 'c1', status: 'failed', rawOutput: 'boom' })).toEqual([
      { kind: 'tool-result', toolCallId: 'c1', toolName: 'opencode: unknown', output: 'boom' }
    ])
  })

  it('drops plan/mode/usage/unknown updates', () => {
    expect(foldAcpUpdate({ sessionUpdate: 'plan', entries: [] })).toEqual([])
    expect(foldAcpUpdate({ sessionUpdate: 'usage_update', used: 1, size: 2 })).toEqual([])
    expect(foldAcpUpdate({ sessionUpdate: 'whatever' })).toEqual([])
    expect(foldAcpUpdate(null)).toEqual([])
  })
})

describe('pickPermissionOption', () => {
  const opts = [
    { optionId: 'allow', kind: 'allow_once' },
    { optionId: 'always', kind: 'allow_always' },
    { optionId: 'no', kind: 'reject_once' }
  ]
  it('picks allow on approve, reject on deny', () => {
    expect(pickPermissionOption(opts, true)).toBe('allow')
    expect(pickPermissionOption(opts, false)).toBe('no')
    expect(pickPermissionOption([], true)).toBe(null)
  })
})

class FakeAcpChild extends EventEmitter {
  writes: string[] = []
  killed: string[] = []
  stdin = {
    write: (s: string): boolean => {
      this.writes.push(s)
      this.onWrite(s)
      return true
    }
  }
  stdout = new EventEmitter()
  stderr = new EventEmitter()
  onWrite(_s: string): void {}
  kill(signal?: string): boolean {
    this.killed.push(signal ?? '')
    queueMicrotask(() => this.emit('exit', 0))
    return true
  }
  emitLine(obj: unknown): void {
    this.stdout.emit('data', Buffer.from(`${JSON.stringify(obj)}\n`))
  }
  requests(): Array<{ id: number; method: string; params: unknown }> {
    return this.writes
      .map((w) => JSON.parse(w) as { id?: number; method?: string; params?: unknown })
      .filter((m) => typeof m.id === 'number' && typeof m.method === 'string')
      .map((m) => ({ id: m.id as number, method: m.method as string, params: m.params }))
  }
}

function scriptedChild(script: (child: FakeAcpChild, msg: { id: number; method: string; params: unknown }) => void): {
  child: FakeAcpChild
  spawnFn: () => FakeAcpChild
} {
  const child = new FakeAcpChild()
  child.onWrite = (s: string): void => {
    const m = JSON.parse(s) as { id?: number; method?: string; params?: unknown }
    if (typeof m.id === 'number' && typeof m.method === 'string') {
      script(child, { id: m.id, method: m.method, params: m.params })
    }
  }
  return { child, spawnFn: () => child }
}

function collect() {
  const events: AgentEvent[] = []
  return { events, emit: (e: AgentEvent): void => void events.push(e) }
}

describe('runAcpPrompt', () => {
  it('streams text and tools, returns the accumulated text', async () => {
    const { spawnFn } = scriptedChild((child, msg) => {
      if (msg.method === 'initialize') child.emitLine({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: 1 } })
      if (msg.method === 'session/new') child.emitLine({ jsonrpc: '2.0', id: msg.id, result: { sessionId: 's1' } })
      if (msg.method === 'session/prompt') {
        child.emitLine({
          jsonrpc: '2.0',
          method: 'session/update',
          params: { sessionId: 's1', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'hello ' } } }
        })
        child.emitLine({
          jsonrpc: '2.0',
          method: 'session/update',
          params: { sessionId: 's1', update: { sessionUpdate: 'tool_call', toolCallId: 'c1', name: 'read', title: 'Read', status: 'pending' } }
        })
        child.emitLine({
          jsonrpc: '2.0',
          method: 'session/update',
          params: {
            sessionId: 's1',
            update: { sessionUpdate: 'tool_call_update', toolCallId: 'c1', name: 'read', status: 'completed', content: [{ type: 'content', content: { type: 'text', text: 'ok' } }] }
          }
        })
        // Another session's updates must not leak in.
        child.emitLine({
          jsonrpc: '2.0',
          method: 'session/update',
          params: { sessionId: 's2', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'leak' } } }
        })
        child.emitLine({ jsonrpc: '2.0', id: msg.id, result: { stopReason: 'end_turn' } })
      }
    })
    const { events, emit } = collect()
    const out = await runAcpPrompt({ prompt: 'hi', runId: 'r1', emit }, { spawnFn: spawnFn as never, timeoutMs: 0 })
    expect(out).toEqual({ text: 'hello ', steps: 1 })
    expect(events.map((e) => e.type)).toEqual(['text-delta', 'tool-call', 'tool-result'])
    expect(events[0]).toMatchObject({ type: 'text-delta', runId: 'r1', delta: 'hello ' })
  })

  it('asks approval via an in-app card and answers the selected option', async () => {
    const seen: string[] = []
    const { child, spawnFn } = scriptedChild((c, msg) => {
      if (msg.method === 'initialize') c.emitLine({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: 1 } })
      if (msg.method === 'session/new') c.emitLine({ jsonrpc: '2.0', id: msg.id, result: { sessionId: 's1' } })
      if (msg.method === 'session/prompt') {
        c.emitLine({
          jsonrpc: '2.0',
          id: 99,
          method: 'session/request_permission',
          params: {
            sessionId: 's1',
            toolCall: { toolCallId: 'c9', title: 'Edit a.ts', kind: 'edit' },
            options: [
              { optionId: 'allow', name: 'Allow', kind: 'allow_once' },
              { optionId: 'deny', name: 'Deny', kind: 'reject_once' }
            ]
          }
        })
        c.emitLine({ jsonrpc: '2.0', id: msg.id, result: { stopReason: 'end_turn' } })
      }
    })
    const { events, emit } = collect()
    const out = await runAcpPrompt(
      {
        prompt: 'edit it',
        runId: 'r2',
        emit,
        onPermission: async (perm) => {
          seen.push(`${perm.toolName}:${perm.toolCallId}`)
          return true
        }
      },
      { spawnFn: spawnFn as never, timeoutMs: 0 }
    )
    await new Promise((r) => setTimeout(r, 0))
    expect(out).toEqual({ text: '', steps: 0 })
    expect(seen).toEqual(['opencode: Edit a.ts:c9'])
    expect(events[0]).toMatchObject({ type: 'approval-requested', approvalId: 'acp-perm-99', toolName: 'opencode: Edit a.ts' })
    let answer: { id?: number; result?: { outcome?: { outcome?: string; optionId?: string } } } | undefined
    for (let i = 0; i < 200 && !answer; i++) {
      answer = child.writes
        .map((w) => JSON.parse(w) as { id?: number; result?: { outcome?: { outcome?: string; optionId?: string } } })
        .find((m) => m.id === 99)
      if (!answer) await new Promise((r) => setTimeout(r, 10))
    }
    expect(answer?.result?.outcome).toEqual({ outcome: 'selected', optionId: 'allow' })
  })

  it('serves fs reads from disk and surfaces prompt errors', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'acp-test-'))
    const file = join(dir, 'note.txt')
    writeFileSync(file, 'file-body')
    const { child, spawnFn } = scriptedChild((c, msg) => {
      if (msg.method === 'initialize') c.emitLine({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: 1 } })
      if (msg.method === 'session/new') c.emitLine({ jsonrpc: '2.0', id: msg.id, result: { sessionId: 's1' } })
      if (msg.method === 'session/prompt') {
        c.emitLine({ jsonrpc: '2.0', id: 7, method: 'fs/read_text_file', params: { path: file } })
        c.emitLine({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: 'Provider request failed with HTTP 404' } })
      }
    })
    const { events, emit } = collect()
    const out = await runAcpPrompt({ prompt: 'hi', runId: 'r3', emit }, { spawnFn: spawnFn as never, timeoutMs: 0 })
    // The fs answer follows real disk I/O; poll instead of sleeping fixed ms.
    let fsAnswer: { id?: number; result?: { content?: string } } | undefined
    for (let i = 0; i < 200 && !fsAnswer; i++) {
      fsAnswer = child.writes
        .map((w) => JSON.parse(w) as { id?: number; result?: { content?: string } })
        .find((m) => m.id === 7)
      if (!fsAnswer) await new Promise((r) => setTimeout(r, 10))
    }
    expect(out).toEqual({ text: '', steps: 0 })
    expect(fsAnswer?.result?.content).toBe('file-body')
    expect(events.at(-1)).toMatchObject({ type: 'error', runId: 'r3' })
    expect((events.at(-1) as { message?: string }).message ?? '').toMatch(/404/)
  })

  it('reports a missing binary clearly', async () => {
    const { events, emit } = collect()
    const out = await runAcpPrompt(
      { prompt: 'hi', runId: 'r4', emit },
      {
        spawnFn: (() => {
          throw new Error('spawn opencode ENOENT')
        }) as never,
        timeoutMs: 0
      }
    )
    expect(out).toEqual({ text: '', steps: 0 })
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'error' })
    expect((events[0] as { message?: string }).message ?? '').toMatch(/not.*PATH|opencode/i)
  })

  it('selects the requested model before prompting', async () => {
    const seen: unknown[] = []
    const { spawnFn } = scriptedChild((child, msg) => {
      if (msg.method === 'initialize') child.emitLine({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: 1 } })
      if (msg.method === 'session/new') child.emitLine({ jsonrpc: '2.0', id: msg.id, result: { sessionId: 's1' } })
      if (msg.method === 'session/set_config_option') {
        seen.push(msg.params)
        child.emitLine({ jsonrpc: '2.0', id: msg.id, result: { configOptions: [] } })
      }
      if (msg.method === 'session/prompt') {
        child.emitLine({ jsonrpc: '2.0', id: msg.id, result: { stopReason: 'end_turn' } })
      }
    })
    const { events, emit } = collect()
    const out = await runAcpPrompt(
      { prompt: 'hi', model: 'opencode/big-pickle', runId: 'r5', emit },
      { spawnFn: spawnFn as never, timeoutMs: 0 }
    )
    expect(out).toEqual({ text: '', steps: 0 })
    expect(seen).toEqual([{ sessionId: 's1', configId: 'model', value: 'opencode/big-pickle' }])
    expect(events).toEqual([])
  })

  it('fails clearly when the model is rejected', async () => {
    const { spawnFn } = scriptedChild((child, msg) => {
      if (msg.method === 'initialize') child.emitLine({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: 1 } })
      if (msg.method === 'session/new') child.emitLine({ jsonrpc: '2.0', id: msg.id, result: { sessionId: 's1' } })
      if (msg.method === 'session/set_config_option') {
        child.emitLine({ jsonrpc: '2.0', id: msg.id, error: { code: -32602, message: 'unknown model' } })
      }
    })
    const { events, emit } = collect()
    const out = await runAcpPrompt(
      { prompt: 'hi', model: 'opencode/big-pickle', runId: 'r6', emit },
      { spawnFn: spawnFn as never, timeoutMs: 0 }
    )
    expect(out).toEqual({ text: '', steps: 0 })
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'error', runId: 'r6' })
    expect((events[0] as { message?: string }).message ?? '').toMatch(/opencode\/big-pickle/)
  })
})

describe('flattenConfigOptions', () => {
  it('flattens flat and grouped values', () => {
    expect(flattenConfigOptions({ options: [{ value: 'a', name: 'A' }, { value: 'b' }] })).toEqual([
      { value: 'a', name: 'A' },
      { value: 'b', name: 'b' }
    ])
    expect(
      flattenConfigOptions({ options: [{ group: 'g', name: 'G', options: [{ value: 'c', name: 'C' }] }] })
    ).toEqual([{ value: 'c', name: 'C' }])
    expect(flattenConfigOptions({})).toEqual([])
    expect(flattenConfigOptions(null)).toEqual([])
  })
})

describe('listAcpModels', () => {
  it('returns the current model and flat options', async () => {
    const { spawnFn } = scriptedChild((child, msg) => {
      if (msg.method === 'initialize') child.emitLine({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: 1 } })
      if (msg.method === 'session/new') {
        child.emitLine({
          jsonrpc: '2.0',
          id: msg.id,
          result: {
            sessionId: 's1',
            configOptions: [
              {
                id: 'model',
                currentValue: 'opencode/big-pickle',
                options: [
                  { value: 'opencode/big-pickle', name: 'Big Pickle' },
                  { group: 'other', name: 'Other', options: [{ value: 'x/y', name: 'Y' }] }
                ]
              }
            ]
          }
        })
      }
    })
    const list = await listAcpModels({ spawnFn: spawnFn as never, timeoutMs: 0 })
    expect(list).toEqual({
      current: 'opencode/big-pickle',
      options: [
        { value: 'opencode/big-pickle', name: 'Big Pickle' },
        { value: 'x/y', name: 'Y' }
      ]
    })
  })

  it('throws a chat-ready message when the binary is missing', async () => {
    await expect(
      listAcpModels({
        spawnFn: (() => {
          throw new Error('spawn opencode ENOENT')
        }) as never,
        timeoutMs: 0
      })
    ).rejects.toThrow(/not.*PATH|opencode/i)
  })
})
