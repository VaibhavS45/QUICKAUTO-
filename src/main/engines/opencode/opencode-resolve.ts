import type { OpencodeClientLike } from './opencode-server.js'

/**
 * Runs one conflict-resolution turn inside an OpenCode session.
 *
 * Permission mapping (SDK 1.18.35 event: `permission.updated` with Permission
 * { id, type, pattern, title, sessionID, metadata }):
 * - read-only tools (read, glob, grep, lsp, todowrite) run automatically.
 * - edits and unknown tools pause for an in-app approve/deny card.
 * - bash: the configured test command and read-only git commands run
 *   automatically; everything else asks.
 * - network tools (webfetch, websearch) are denied — merging needs no web.
 * Answers go back via postSessionIdPermissionsPermissionId ('once'/'reject').
 */

export interface OpencodePermission {
  id: string
  type: string
  title: string
  pattern?: string | string[]
  sessionID: string
  metadata?: Record<string, unknown>
}

export type PermissionVerdict = 'allow' | 'ask' | 'deny'

const READ_ONLY_TYPES = new Set(['read', 'glob', 'grep', 'lsp', 'todowrite', 'skill'])
const NETWORK_TYPES = new Set(['webfetch', 'websearch'])
const SAFE_GIT_RE = /^git\s+(status|diff|log|show|rev-parse|ls-files|branch|stash\s+list|remote\s+-v)\b/

function firstPattern(pattern: OpencodePermission['pattern']): string {
  if (typeof pattern === 'string') return pattern
  if (Array.isArray(pattern)) return pattern.find((p) => typeof p === 'string') ?? ''
  return ''
}

export function classifyOpencodePermission(
  perm: Pick<OpencodePermission, 'type' | 'pattern'>,
  opts: { testCommand?: string } = {}
): PermissionVerdict {
  const type = perm.type
  if (READ_ONLY_TYPES.has(type)) return 'allow'
  if (NETWORK_TYPES.has(type)) return 'deny'
  if (type === 'edit') return 'ask'
  if (type === 'bash') {
    const cmd = firstPattern(perm.pattern).trim()
    if (!cmd) return 'ask'
    if (SAFE_GIT_RE.test(cmd)) return 'allow'
    if (opts.testCommand) {
      const t = opts.testCommand.trim()
      if (cmd === t || cmd.startsWith(`${t} `) || cmd.startsWith(`${t}&&`) || cmd.startsWith(`${t};`)) return 'allow'
    }
    return 'ask'
  }
  return 'ask'
}

export interface OpencodeResolveRequest {
  client: OpencodeClientLike
  directory: string
  prompt: string
  testCommand?: string
  signal?: AbortSignal
  /** Called for 'ask' verdicts; must resolve true (once) / false (reject). */
  onPermission: (perm: OpencodePermission) => Promise<boolean>
}

export interface OpencodePromptRequest extends OpencodeResolveRequest {
  title?: string
}

export interface OpencodeResolveResult {
  /** Assistant text (tail). */
  summary: string
  resolved: string[]
  unresolved: Array<{ file: string; reason: string }>
}

function unwrapData<T>(res: unknown, what: string): T {
  // hey-api 'fields' style: { data, error, request, response }. Note success
  // responses carry NO error key at all, so check truthiness, not presence.
  if (res !== null && typeof res === 'object' && 'data' in res) {
    const r = res as { data?: T; error?: unknown }
    if (r.error) throw new Error(`OpenCode ${what} failed: ${JSON.stringify(r.error).slice(0, 500)}`)
    return r.data as T
  }
  return res as T
}

function assistantText(promptResult: unknown): string {
  const r = promptResult as {
    parts?: Array<{ type?: string; text?: string }>
    info?: { parts?: Array<{ type?: string; text?: string }> }
  }
  const parts = r.parts ?? r.info?.parts ?? []
  return parts
    .filter((p) => p.type === 'text' && typeof p.text === 'string')
    .map((p) => p.text as string)
    .join('\n')
}

/** Last {...} JSON object in text with resolved/unresolved arrays. */
export function parseResolveOutcome(text: string): { resolved: string[]; unresolved: Array<{ file: string; reason: string }> } {
  const resolved: string[] = []
  const unresolved: Array<{ file: string; reason: string }> = []
  // Scan brace-balanced candidates from the end; first parseable object with
  // a resolved/unresolved shape wins.
  const starts: number[] = []
  for (let i = text.length - 1; i >= 0; i--) {
    if (text[i] === '{') starts.push(i)
  }
  for (const start of starts) {
    let depth = 0
    let inStr = false
    let esc = false
    for (let j = start; j < text.length; j++) {
      const ch = text[j] as string
      if (inStr) {
        if (esc) esc = false
        else if (ch === '\\') esc = true
        else if (ch === '"') inStr = false
      } else if (ch === '"') {
        inStr = true
      } else if (ch === '{') {
        depth++
      } else if (ch === '}') {
        depth--
        if (depth === 0) {
          const candidate = text.slice(start, j + 1)
          if (!candidate.includes('"resolved"') && !candidate.includes('"unresolved"')) break
          try {
            const obj = JSON.parse(candidate) as { resolved?: unknown; unresolved?: unknown }
            if (Array.isArray(obj.resolved)) {
              for (const f of obj.resolved) if (typeof f === 'string') resolved.push(f)
            }
            if (Array.isArray(obj.unresolved)) {
              for (const u of obj.unresolved) {
                const o = u as { file?: unknown; reason?: unknown }
                unresolved.push({ file: String(o.file ?? '?'), reason: String(o.reason ?? 'no reason given') })
              }
            }
            return { resolved, unresolved }
          } catch {
            break
          }
        }
      }
    }
  }
  return { resolved, unresolved }
}

/**
 * Generic one-shot prompt in an OpenCode session with the same permission
 * gating as conflict resolution. Returns the tail of the assistant text.
 * Streaming text-deltas are skipped: the prompt result is authoritative.
 */
export async function runOpencodePrompt(req: OpencodePromptRequest): Promise<string> {
  const { client, directory } = req
  const session = unwrapData<{ id: string }>(
    await req.client.session.create({ query: { directory }, body: { title: req.title ?? 'Palette agent run' } }),
    'session.create'
  )

  const sseController = new AbortController()
  const sseDone = (async () => {
    try {
      const sub = (await client.event.subscribe({ signal: sseController.signal })) as unknown as {
        stream: AsyncIterable<{ type?: string; properties?: OpencodePermission }>
      }
      const stream: AsyncIterable<{ type?: string; properties?: OpencodePermission }> =
        sub && typeof sub === 'object' && 'stream' in sub
          ? (sub.stream as AsyncIterable<{ type?: string; properties?: OpencodePermission }>)
          : (sub as unknown as AsyncIterable<{ type?: string; properties?: OpencodePermission }>)
      for await (const ev of stream) {
        if (ev?.type !== 'permission.updated' || !ev.properties) continue
        const perm = ev.properties
        if (perm.sessionID !== session.id) continue
        const verdict = classifyOpencodePermission(perm, { testCommand: req.testCommand })
        let response: 'once' | 'reject' = 'reject'
        if (verdict === 'allow') response = 'once'
        else if (verdict === 'ask') {
          try {
            response = (await req.onPermission(perm)) ? 'once' : 'reject'
          } catch {
            response = 'reject'
          }
        }
        try {
          await client.postSessionIdPermissionsPermissionId({
            path: { id: session.id, permissionID: perm.id },
            body: { response },
            query: { directory }
          })
        } catch {
          /* session may be gone; prompt result carries the outcome */
        }
      }
    } catch {
      /* aborted or connection closed — prompt result is authoritative */
    }
  })()
  // Never let a stray SSE rejection escape.
  sseDone.catch(() => undefined)

  try {
    if (req.signal?.aborted) {
      await abortSession(client, directory, session.id)
      throw abortError()
    }
    const promptResult = unwrapData<unknown>(
      await client.session.prompt({
        path: { id: session.id },
        body: { parts: [{ type: 'text', text: req.prompt }] },
        query: { directory },
        ...(req.signal ? { signal: req.signal } : {})
      }),
      'session.prompt'
    )
    const summary = assistantText(promptResult).slice(-4000)
    return summary
  } catch (err) {
    if (req.signal?.aborted) {
      await abortSession(client, directory, session.id).catch(() => undefined)
    }
    throw err
  } finally {
    sseController.abort()
    await Promise.race([sseDone, new Promise((r) => setTimeout(r, 2000))])
  }
}

export async function runOpencodeResolve(req: OpencodeResolveRequest): Promise<OpencodeResolveResult> {
  const summary = await runOpencodePrompt({ ...req, title: 'Palette: resolve PR conflicts' })
  const { resolved, unresolved } = parseResolveOutcome(summary)
  return { summary, resolved, unresolved }
}

async function abortSession(client: OpencodeClientLike, directory: string, id: string): Promise<void> {
  try {
    await client.session.abort({ path: { id }, query: { directory } })
  } catch {
    /* best effort */
  }
}

function abortError(): Error {
  return Object.assign(new Error('OpenCode run aborted.'), { name: 'AbortError' })
}
