import { spawn, type ChildProcess } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import type { AgentEvent } from '../../shared/agent.js'
import { resolveOpenCodeBinary } from './agent-provider.js'

/**
 * ACP client for the chat window. Spawns `opencode acp` (Agent Client
 * Protocol, agentclientprotocol.com, protocol v1) as a child process and
 * speaks newline-delimited JSON-RPC over stdio with the stdlib only — no new
 * dependency for framing three methods (`initialize`, `session/new`,
 * `session/prompt`) plus two agent->client requests
 * (`session/request_permission`, `fs/read_text_file`).
 *
 * Verified Oct 2026 against `opencode v2.0.20 acp`:
 * - initialize { protocolVersion: 1, clientCapabilities } -> agentCapabilities
 * - session/new { cwd, mcpServers: [] } -> { sessionId, configOptions }
 * - session/prompt { sessionId, prompt: [{type:'text',text}] } streams
 *   `session/update` notifications, resolves { stopReason }
 * - permission: `session/request_permission` { sessionId, toolCall, options[] }
 *   with option kinds allow_once/allow_always/reject_once/reject_always;
 *   cancelled turns answer { outcome: { outcome: 'cancelled' } }
 * - cancel: `session/cancel` notification, prompt resolves { stopReason:
 *   'cancelled' }.
 *
 * One process per run (same shape as pi-run.ts): no cross-run state to leak.
 * // ponytail: one-shot process; keep a persistent `opencode acp` across chat
 * turns if spawn latency (~1s) ever matters.
 */

export interface AcpPermission {
  id: string
  toolCallId: string
  toolName: string
  input: unknown
  reason?: string
}

export interface AcpRunRequest {
  prompt: string
  systemPrompt?: string
  runId: string
  cwd?: string
  /** ACP model id (e.g. 'opencode/big-pickle'); unset = agent default. */
  model?: string
  signal?: AbortSignal
  emit: (e: AgentEvent) => void
  /** Fail-closed: absent or false denies the permission. */
  onPermission?: (perm: AcpPermission) => Promise<boolean>
}

export interface AcpRunDeps {
  spawnFn?: (
    cmd: string,
    args: string[],
    opts: { cwd?: string }
  ) => ChildProcess & { stdout?: NodeJS.ReadableStream | null; stderr?: NodeJS.ReadableStream | null; stdin?: NodeJS.WritableStream | null }
  binary?: string
  timeoutMs?: number
}

type EmitAction =
  | { kind: 'text'; text: string }
  | { kind: 'tool-call'; toolCallId: string; toolName: string; input: unknown }
  | { kind: 'tool-result'; toolCallId: string; toolName: string; output: unknown }

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {}
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/** Human-readable text for one ACP content block (text/diff; else ''). */
export function acpContentText(block: unknown): string {
  const b = asRecord(block)
  if (b['type'] === 'text' && typeof b['text'] === 'string') return b['text'] as string
  if (b['type'] === 'diff') {
    const path = str(b['path']) || 'file'
    const oldText = typeof b['oldText'] === 'string' ? (b['oldText'] as string) : null
    const newText = str(b['newText'])
    return oldText === null ? `new file ${path}:\n${newText}` : `diff ${path}:\n--- before\n${oldText}\n+++ after\n${newText}`
  }
  if (b['type'] === 'terminal' && typeof b['terminalId'] === 'string') return `[terminal ${b['terminalId'] as string}]`
  return ''
}

function toolText(contents: unknown): string {
  if (!Array.isArray(contents)) return ''
  return contents
    .map((item) => {
      const inner = asRecord(item)
      // {type:'content',content:{...}} wrapper or a bare block.
      return acpContentText(inner['type'] === 'content' ? inner['content'] : item)
    })
    .filter(Boolean)
    .join('\n')
}

/**
 * Fold one `session/update` payload into chat events. Pure (unit-tested);
 * plan/mode/config/usage/notice updates carry no chat content and fold to [].
 */
export function foldAcpUpdate(update: unknown): EmitAction[] {
  const u = asRecord(update)
  switch (u['sessionUpdate']) {
    case 'agent_message_chunk':
    case 'agent_thought_chunk': {
      const text = acpContentText(u['content'])
      return text ? [{ kind: 'text', text }] : []
    }
    case 'tool_call': {
      const id = str(u['toolCallId'])
      if (!id) return []
      const name = str(u['name']) || str(u['title']) || 'unknown'
      return [{ kind: 'tool-call', toolCallId: id, toolName: `opencode: ${name}`, input: u['rawInput'] ?? null }]
    }
    case 'tool_call_update': {
      const id = str(u['toolCallId'])
      if (!id) return []
      const status = str(u['status'])
      if (status !== 'completed' && status !== 'failed') return []
      const name = str(u['name']) || str(u['title']) || 'unknown'
      const text = toolText(u['content'])
      const raw = u['rawOutput']
      return [
        {
          kind: 'tool-result',
          toolCallId: id,
          toolName: `opencode: ${name}`,
          output: text || (raw !== undefined ? raw : null)
        }
      ]
    }
    default:
      return []
  }
}

export interface PermissionOption {
  optionId: string
  kind: string
}

/** Approved -> first allow_* option; denied -> first reject_* option. */
export function pickPermissionOption(options: PermissionOption[], approved: boolean): string | null {
  const want = approved ? 'allow_' : 'reject_'
  return (
    options.find((o) => o.kind.startsWith(want))?.optionId ??
    (approved ? options[0]?.optionId ?? null : options[options.length - 1]?.optionId ?? null)
  )
}

interface Pending {
  resolve: (v: unknown) => void
  reject: (e: Error) => void
}

function rpcError(id: unknown, code: number, message: string): string {
  return `${JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } })}\n`
}

/** Frame NDJSON stdout into lines. Shared by runs and model listing. */
function pipeLines(
  child: { stdout?: NodeJS.ReadableStream | null },
  onLine: (line: string) => void
): void {
  let buffer = ''
  child.stdout?.on('data', (d: Buffer) => {
    buffer += d.toString('utf8')
    let idx: number
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).replace(/\r$/, '')
      buffer = buffer.slice(idx + 1)
      if (!line.trim()) continue
      onLine(line)
    }
  })
}

export interface AcpModelOption {
  value: string
  name: string
}

export interface AcpModelList {
  current: string
  options: AcpModelOption[]
}

/** Flatten select options (the model option may group values). */
export function flattenConfigOptions(option: unknown): AcpModelOption[] {
  const o = asRecord(option)
  const raw = o['options']
  if (!Array.isArray(raw)) return []
  const out: AcpModelOption[] = []
  for (const entry of raw) {
    const e = asRecord(entry)
    if (Array.isArray(e['options'])) {
      for (const sub of e['options'] as unknown[]) {
        const s = asRecord(sub)
        if (typeof s['value'] === 'string' && s['value']) {
          out.push({ value: s['value'] as string, name: typeof s['name'] === 'string' && s['name'] ? (s['name'] as string) : (s['value'] as string) })
        }
      }
    } else if (typeof e['value'] === 'string' && e['value']) {
      out.push({ value: e['value'] as string, name: typeof e['name'] === 'string' && e['name'] ? (e['name'] as string) : (e['value'] as string) })
    }
  }
  return out
}

/**
 * List the models this machine's `opencode acp` offers (one short-lived
 * process; mirrors the run handshake). Throws a chat-ready message on failure.
 */
export async function listAcpModels(
  deps: AcpRunDeps & { cwd?: string } = {}
): Promise<AcpModelList> {
  const spawnFn =
    deps.spawnFn ?? ((cmd: string, a: string[], opts: { cwd?: string }) => spawn(cmd, a, { cwd: opts.cwd }))
  let child: ReturnType<NonNullable<AcpRunDeps['spawnFn']>>
  try {
    child = spawnFn(    deps.binary ?? resolveOpenCodeBinary(), ['acp'], { cwd: deps.cwd }) as ReturnType<
      NonNullable<AcpRunDeps['spawnFn']>
    >
  } catch (err) {
    throw new Error(
      `Could not start "opencode acp": ${(err as Error).message}. Install OpenCode (https://opencode.ai) and ensure "opencode" is on PATH.`
    )
  }
  let nextId = 0
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
  let stderrTail = ''
  const kill = (): void => {
    try {
      child.kill('SIGTERM')
    } catch {
      /* already gone */
    }
  }
  const done = new Promise<void>((resolve) => {
    const timer = deps.timeoutMs === 0 ? null : setTimeout(kill, deps.timeoutMs ?? 30000)
    const finish = (code: number | null): void => {
      if (timer) clearTimeout(timer)
      for (const p of pending.values()) {
        p.reject(
          code === null
            ? new Error('opencode binary not found on PATH. Install OpenCode (https://opencode.ai) first.')
            : new Error(
                `opencode acp exited (code ${code}). ${stderrTail.trim() || 'Check: run "opencode auth login" in a terminal.'}`.slice(0, 300)
              )
        )
      }
      pending.clear()
      resolve()
    }
    child.once('error', () => finish(null))
    child.once('exit', (code) => finish(code))
  })
  pipeLines(child, (line) => {
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(line) as Record<string, unknown>
    } catch {
      return
    }
    // Answer agent->client requests so listing never stalls on permission/fs.
    if (typeof msg['method'] === 'string' && msg['id'] !== undefined) {
      const method = msg['method'] as string
      const id = msg['id']
      if (method === 'session/request_permission') {
        const params = asRecord(msg['params'])
        const options = Array.isArray(params['options']) ? params['options'] : []
        const reject = (options as unknown[]).map((o) => asRecord(o)).find((o) => str(asRecord(o)['kind']).startsWith('reject_'))
        const optionId = typeof reject?.['optionId'] === 'string' ? (reject['optionId'] as string) : null
        child.stdin?.write(
          `${JSON.stringify({ jsonrpc: '2.0', id, result: optionId ? { outcome: { outcome: 'selected', optionId } } : { outcome: { outcome: 'cancelled' } } })}\n`
        )
        return
      }
      child.stdin?.write(rpcError(id, -32601, `Unsupported method: ${method}`))
      return
    }
    if (typeof msg['id'] === 'number') {
      const p = pending.get(msg['id'] as number)
      if (!p) return
      pending.delete(msg['id'] as number)
      if (msg['error'] !== undefined) {
        p.reject(new Error(str(asRecord(msg['error'])['message']) || 'OpenCode request failed.'))
      } else {
        p.resolve(msg['result'])
      }
    }
  })
  child.stderr?.on('data', (d: Buffer) => {
    stderrTail = `${stderrTail}${d.toString()}`.slice(-2000)
  })
  const request = (method: string, params: unknown): Promise<unknown> =>
    new Promise((resolve, reject) => {
      nextId += 1
      const id = nextId
      pending.set(id, { resolve, reject })
      try {
        child.stdin?.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
      } catch (err) {
        pending.delete(id)
        reject(err as Error)
      }
    })
  try {
    const init = (await request('initialize', {
      protocolVersion: 1,
      clientCapabilities: { fs: { readTextFile: true } }
    })) as Record<string, unknown>
    if (typeof init !== 'object' || init === null) throw new Error('OpenCode initialize failed.')
    const created = (await request('session/new', { cwd: deps.cwd, mcpServers: [] })) as {
      sessionId?: unknown
      configOptions?: unknown
    }
    const options = Array.isArray(created?.configOptions) ? created.configOptions : []
    const model = options.map((o) => asRecord(o)).find((o) => o['id'] === 'model')
    if (!model) throw new Error('OpenCode did not advertise a model option.')
    return {
      current: typeof model['currentValue'] === 'string' ? (model['currentValue'] as string) : '',
      options: flattenConfigOptions(model)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (/not found on PATH|exited|auth login/i.test(message)) throw err instanceof Error ? err : new Error(message)
    throw new Error(`Could not list OpenCode models: ${message.slice(0, 200)}`)
  } finally {
    kill()
    await done
  }
}

export async function runAcpPrompt(req: AcpRunRequest, deps: AcpRunDeps = {}): Promise<{ text: string; steps: number }> {
  const { runId, emit } = req
  const fail = (message: string): { text: string; steps: number } => {
    emit({ type: 'error', runId, message })
    return { text: '', steps: 0 }
  }

  const spawnFn =
    deps.spawnFn ?? ((cmd: string, a: string[], opts: { cwd?: string }) => spawn(cmd, a, { cwd: opts.cwd }))
  let child: ReturnType<NonNullable<AcpRunDeps['spawnFn']>>
  try {
    child = spawnFn(deps.binary ?? resolveOpenCodeBinary(), ['acp'], { cwd: req.cwd }) as ReturnType<
      NonNullable<AcpRunDeps['spawnFn']>
    >
  } catch (err) {
    return fail(
      `Could not start "opencode acp": ${(err as Error).message}. Install OpenCode (https://opencode.ai) and ensure "opencode" is on PATH.`
    )
  }

  // ponytail: whole-output cap (200KB text), stream-to-renderer if huge runs matter
  const CAP = 200_000
  let text = ''
  let steps = 0
  let stderrTail = ''
  let nextId = 0
  const pending = new Map<number, Pending>()
  let sessionId = ''
  let settled = false
  const track = (s: string): void => {
    if (text.length < CAP) text += s.slice(0, CAP - text.length)
  }

  const notify = (method: string, params: unknown): void => {
    child.stdin?.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`)
  }
  const request = (method: string, params: unknown): Promise<unknown> =>
    new Promise((resolve, reject) => {
      // Register before writing: a fast agent may answer synchronously.
      nextId += 1
      const id = nextId
      pending.set(id, { resolve, reject })
      try {
        child.stdin?.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`)
      } catch (err) {
        pending.delete(id)
        reject(err as Error)
      }
    })

  const kill = (): void => {
    try {
      child.kill('SIGTERM')
    } catch {
      /* already gone */
    }
  }

  let promptId = 0
  const finish = (code: number | null): void => {
    if (settled) return
    settled = true
    const p = pending.get(promptId)
    pending.clear()
    if (code === null) {
      p?.reject(Object.assign(new Error('opencode binary not found on PATH. Install OpenCode (https://opencode.ai) first.'), { code: 'ENOENT' }))
    } else {
      p?.reject(new Error(`opencode acp exited (code ${code}). ${stderrTail.trim() || 'Check: run "opencode auth login" in a terminal.'}`.slice(0, 500)))
    }
  }

  const done = new Promise<number | null>((resolve) => {
    const killTimer =
      deps.timeoutMs === 0
        ? null
        : setTimeout(kill, deps.timeoutMs ?? 300000)
    const finishRun = (code: number | null): void => {
      if (killTimer) clearTimeout(killTimer)
      finish(code)
      resolve(code)
    }
    child.once('error', () => finishRun(null))
    child.once('exit', (code) => finishRun(code))
    req.signal?.addEventListener('abort', () => {
      if (sessionId) notify('session/cancel', { sessionId })
      kill()
      finishRun(null)
    })
  })

  const onPermission = req.onPermission
  const handleLine = async (line: string): Promise<void> => {
    let msg: Record<string, unknown>
    try {
      msg = JSON.parse(line) as Record<string, unknown>
    } catch {
      return
    }
    // Agent -> client request (has method + id): permission or fs.
    if (typeof msg['method'] === 'string' && msg['id'] !== undefined) {
      const method = msg['method'] as string
      const id = msg['id']
      const params = asRecord(msg['params'])
      if (method === 'session/request_permission') {
        const toolCall = asRecord(params['toolCall'])
        const options = (Array.isArray(params['options']) ? params['options'] : []).map((o) => {
          const r = asRecord(o)
          return { optionId: str(r['optionId']), kind: str(r['kind']) }
        }).filter((o) => o.optionId)
        const title = str(toolCall['title']) || str(toolCall['name']) || 'OpenCode tool'
        const approvalId = `acp-perm-${String(id)}`
        const toolCallId = str(toolCall['toolCallId']) || approvalId
        emit({
          type: 'approval-requested',
          runId,
          approvalId,
          toolCallId,
          toolName: `opencode: ${title}`,
          input: { title, kind: str(toolCall['kind']) || null },
          reason: 'OpenCode requests permission.'
        })
        let approved = false
        try {
          approved = req.signal?.aborted ? false : (await onPermission?.({ id: approvalId, toolCallId, toolName: `opencode: ${title}`, input: { title } })) ?? false
        } catch {
          approved = false
        }
        const respond = (result: unknown): void => {
          child.stdin?.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`)
        }
        if (req.signal?.aborted) {
          respond({ outcome: { outcome: 'cancelled' } })
          return
        }
        const optionId = pickPermissionOption(options, approved)
        respond(optionId ? { outcome: { outcome: 'selected', optionId } } : { outcome: { outcome: 'cancelled' } })
        return
      }
      if (method === 'fs/read_text_file') {
        const path = str(params['path'])
        try {
          const content = await readFile(path, 'utf8')
          child.stdin?.write(`${JSON.stringify({ jsonrpc: '2.0', id, result: { content: content.slice(0, 256_000) } })}\n`)
        } catch (err) {
          child.stdin?.write(rpcError(id, -32000, `Could not read ${path || 'file'}: ${(err as Error).message}`.slice(0, 300)))
        }
        return
      }
      child.stdin?.write(rpcError(id, -32601, `Unsupported method: ${method}`))
      return
    }
    // Response to our request.
    if (msg['id'] !== undefined && typeof msg['id'] === 'number') {
      const p = pending.get(msg['id'] as number)
      if (!p) return
      pending.delete(msg['id'] as number)
      if (msg['error'] !== undefined) {
        const e = asRecord(msg['error'])
        p.reject(new Error(str(e['message']) || 'OpenCode request failed.'))
      } else {
        p.resolve(msg['result'])
      }
      return
    }
    // Notification: session/update streams the turn.
    if (msg['method'] === 'session/update') {
      const params = asRecord(msg['params'])
      if (sessionId && str(params['sessionId']) !== sessionId) return
      for (const action of foldAcpUpdate(params['update'])) {
        if (action.kind === 'text') {
          track(action.text)
          emit({ type: 'text-delta', runId, delta: action.text })
        } else if (action.kind === 'tool-call') {
          steps += 1
          emit({ type: 'tool-call', runId, toolCallId: action.toolCallId, toolName: action.toolName, input: action.input })
        } else {
          emit({ type: 'tool-result', runId, toolCallId: action.toolCallId, toolName: action.toolName, output: action.output })
        }
      }
    }
  }

  // Consume stdout continuously so a full pipe never stalls the agent.
  pipeLines(child, (line) => void handleLine(line))
  child.stderr?.on('data', (d: Buffer) => {
    stderrTail = `${stderrTail}${d.toString()}`.slice(-2000)
  })

  try {
    const init = (await Promise.race([
      request('initialize', { protocolVersion: 1, clientCapabilities: { fs: { readTextFile: true } } }),
      done.then(() => {
        throw new Error('opencode acp exited before initialize.')
      })
    ])) as Record<string, unknown>
    if (typeof init !== 'object' || init === null) throw new Error('OpenCode initialize failed.')
    const created = (await request('session/new', { cwd: req.cwd, mcpServers: [] })) as Record<string, unknown>
    if (!created || typeof created['sessionId'] !== 'string' || !created['sessionId']) {
      throw new Error('OpenCode could not create a session.')
    }
    sessionId = created['sessionId'] as string
    if (req.signal?.aborted) {
      emit({ type: 'aborted', runId })
      return { text: '', steps: 0 }
    }
    const model = req.model?.trim()
    if (model) {
      try {
        await request('session/set_config_option', { sessionId, configId: 'model', value: model })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        // Process death surfaces here too — keep that diagnosis, not a model error.
        if (/exited|not found on PATH|before initialize/i.test(message)) throw err
        throw new Error(`OpenCode rejected model "${model}": ${message.slice(0, 200)} Pick another in the chat model picker.`)
      }
    }
    const fullPrompt = [req.systemPrompt?.trim() ? `Additional user-provided instructions:\n${req.systemPrompt.trim()}` : '', req.prompt]
      .filter(Boolean)
      .join('\n\n')
    promptId = nextId + 1
    const result = (await request('session/prompt', {
      sessionId,
      prompt: [{ type: 'text', text: fullPrompt }]
    })) as Record<string, unknown>
    if (req.signal?.aborted || str(result['stopReason']) === 'cancelled') {
      emit({ type: 'aborted', runId })
      return { text: '', steps: 0 }
    }
    return { text, steps }
  } catch (err) {
    if (req.signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
      emit({ type: 'aborted', runId })
      return { text: '', steps: 0 }
    }
    const message = err instanceof Error ? err.message : String(err)
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT' || /not found on PATH/i.test(message)) {
      return fail('opencode binary not found on PATH. Install OpenCode (https://opencode.ai) first.')
    }
    if (/auth|login|401|403/i.test(message)) {
      return fail(`OpenCode auth failed: ${message.slice(0, 300)} Run "opencode auth login" in a terminal, then retry.`)
    }
    return fail(message.slice(0, 500))
  } finally {
    kill()
    await done.catch(() => null)
  }
}
