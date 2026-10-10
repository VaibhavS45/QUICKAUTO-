import { spawn, type ChildProcess } from 'node:child_process'
import type { AgentEvent } from '../../shared/agent.js'

/**
 * One-shot runs via the `pi` CLI harness (`pi -p --mode json`, verified
 * against pi.dev JSON Event Stream docs Oct 2026): stdout is strict JSONL —
 * split only on LF, strip one optional CR. Stderr carries diagnostics only.
 *
 * Approval ceiling: print mode has no permission protocol (pi runs with the
 * user's own permissions by design), so per-tool in-app approve/deny cards
 * are impossible here. The submitted prompt IS the approved action; scheduled
 * runs fall back to the builtin runner (see runner.ts) where writes are
 * approval-gated. UI must disclose this (see SettingsDialog AgentPanel).
 */

export interface PiRunRequest {
  prompt: string
  systemPrompt?: string
  runId: string
  cwd?: string
  signal?: AbortSignal
  emit: (e: AgentEvent) => void
}

export interface PiRunDeps {
  spawnFn?: (
    cmd: string,
    args: string[],
    opts: { cwd?: string }
  ) => ChildProcess & { stdout?: NodeJS.ReadableStream | null; stderr?: NodeJS.ReadableStream | null }
  timeoutMs?: number
}

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {}
}

/** Assistant text blocks: `content` is a string or [{type:'text',text}]. */
export function piMessageText(message: unknown): string {
  const m = asRecord(message)
  const c = m['content']
  if (typeof c === 'string') return c
  if (!Array.isArray(c)) return ''
  return c
    .map((b) => {
      const block = asRecord(b)
      return block['type'] === 'text' && typeof block['text'] === 'string' ? (block['text'] as string) : ''
    })
    .join('')
}

/**
 * Fold one JSONL record into streamed output. Returns text/tool events to
 * emit plus any completed assistant text (authoritative on message_end).
 */
export function foldPiEvent(ev: unknown): {
  emit: Array<{ kind: 'text' | 'tool-call' | 'tool-result'; text?: string; toolCallId?: string; toolName?: string; input?: unknown; output?: unknown }>
  finalText?: string
} {
  const e = asRecord(ev)
  const out: ReturnType<typeof foldPiEvent>['emit'] = []
  switch (e['type']) {
    case 'message_update': {
      const inner = asRecord(e['assistantMessageEvent'])
      if (inner['type'] === 'text_delta' && typeof inner['delta'] === 'string' && inner['delta']) {
        out.push({ kind: 'text', text: inner['delta'] as string })
      } else if (inner['type'] === 'text_end') {
        const text = piMessageText({ content: inner['content'] })
        if (text) out.push({ kind: 'text', text })
      }
      return { emit: out }
    }
    case 'tool_execution_start':
      out.push({
        kind: 'tool-call',
        toolCallId: String(e['toolCallId'] ?? ''),
        toolName: `pi: ${String(e['toolName'] ?? 'unknown')}`,
        input: (e['args'] ?? null) as unknown
      })
      return { emit: out }
    case 'tool_execution_end':
      out.push({
        kind: 'tool-result',
        toolCallId: String(e['toolCallId'] ?? ''),
        toolName: `pi: ${String(e['toolName'] ?? 'unknown')}`,
        output: (e['result'] ?? null) as unknown
      })
      return { emit: out }
    case 'message_end':
    case 'turn_end': {
      const msg = e['message']
      const text = piMessageText(msg)
      return { emit: out, ...(text ? { finalText: text } : {}) }
    }
    default:
      return { emit: out }
  }
}

export async function runPiPrompt(req: PiRunRequest, deps: PiRunDeps = {}): Promise<{ text: string; steps: number }> {
  const { runId, emit } = req
  const fail = (message: string): { text: string; steps: number } => {
    emit({ type: 'error', runId, message })
    return { text: '', steps: 0 }
  }

  const args = ['-p', '--mode', 'json', '--no-session']
  const system = req.systemPrompt?.trim()
  if (system) args.push('--system-prompt', system.slice(0, 12000))
  args.push('--', req.prompt)
  const spawnFn =
    deps.spawnFn ??
    ((cmd: string, a: string[], opts: { cwd?: string }) => spawn(cmd, a, { cwd: opts.cwd }))
  let child: ChildProcess
  try {
    child = spawnFn('pi', args, { cwd: req.cwd }) as ChildProcess
  } catch (err) {
    return fail(
      `Could not start "pi": ${(err as Error).message}. Install Pi (https://pi.dev) and ensure "pi" is on PATH.`
    )
  }

  // ponytail: whole-output cap (200KB text), stream-to-renderer if huge runs matter
  const CAP = 200_000
  let text = ''
  let steps = 0
  let stderrTail = ''
  let buffer = ''
  const track = (s: string): void => {
    if (text.length < CAP) text += s.slice(0, CAP - text.length)
  }

  const done = new Promise<number | null>((resolve) => {
    const killTimer =
      deps.timeoutMs === 0
        ? null
        : setTimeout(() => {
            try {
              child.kill('SIGTERM')
            } catch { /* already gone */ }
          }, deps.timeoutMs ?? 300000)
    const finish = (code: number | null): void => {
      if (killTimer) clearTimeout(killTimer)
      resolve(code)
    }
    child.once('error', () => finish(null))
    child.once('exit', (code) => finish(code))
    req.signal?.addEventListener('abort', () => {
      try {
        child.kill('SIGTERM')
      } catch { /* already gone */ }
      finish(null)
    })
  })

  // Consume stdout continuously so a full pipe never stalls pi.
  child.stdout?.on('data', (d: Buffer) => {
    buffer += d.toString('utf8')
    let idx: number
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).replace(/\r$/, '')
      buffer = buffer.slice(idx + 1)
      if (!line.trim()) continue
      let ev: unknown
      try {
        ev = JSON.parse(line)
      } catch {
        continue
      }
      const folded = foldPiEvent(ev)
      for (const item of folded.emit) {
        if (item.kind === 'text' && item.text) {
          track(item.text)
          emit({ type: 'text-delta', runId, delta: item.text })
        } else if (item.kind === 'tool-call') {
          steps += 1
          emit({ type: 'tool-call', runId, toolCallId: item.toolCallId ?? '', toolName: item.toolName ?? 'pi: unknown', input: item.input })
        } else if (item.kind === 'tool-result') {
          emit({ type: 'tool-result', runId, toolCallId: item.toolCallId ?? '', toolName: item.toolName ?? 'pi: unknown', output: item.output })
        }
      }
      if (folded.finalText) {
        // Authoritative completion replaces streamed deltas.
        text = folded.finalText.slice(-CAP)
      }
    }
  })
  child.stderr?.on('data', (d: Buffer) => {
    stderrTail = `${stderrTail}${d.toString()}`.slice(-2000)
  })

  const code = await done
  if (req.signal?.aborted) {
    emit({ type: 'aborted', runId })
    return { text: '', steps: 0 }
  }
  if (code !== 0) {
    const hint = stderrTail.trim()
    return fail(
      code === null
        ? 'pi binary not found on PATH. Install Pi (https://pi.dev) first.'
        : `pi exited (code ${code}). ${hint || 'Check pi auth: run "pi auth check" in a terminal.'}`.slice(0, 500)
    )
  }
  emit({ type: 'done', runId, text, steps })
  return { text, steps }
}
