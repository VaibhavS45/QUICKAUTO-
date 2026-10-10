import { useEffect, useMemo, useRef, useState } from 'react'
import { TOOL_IDS, TOOL_META, TOOL_ALIASES, activeMention, parseMentionedTools } from '../../shared/types.js'
import { ShaderBackdrop } from '../components/ShaderBackdrop.js'
import { Badge } from '../components/ui/badge.js'
import { Button } from '../components/ui/button.js'
import { Kbd } from '../components/ui/kbd.js'
import { useGmailConnect } from '../hooks/useGmailConnect.js'
import '../styles.css'

interface SubmitResponse {
  ok: boolean
  action?: string
  tools?: string[]
  message?: string
  runId?: string
  routine?: { runAt: number; prompt: string }
  error?: string
}

interface ToolCallState {
  toolCallId: string
  toolName: string
  input: unknown
  status: 'running' | 'done' | 'needs-approval' | 'denied'
  output?: unknown
}

interface ApprovalState {
  approvalId: string
  toolCallId: string
  toolName: string
  input: unknown
  reason?: string
}

interface AgentEventMsg {
  type: string
  runId: string
  delta?: string
  toolCallId?: string
  toolName?: string
  input?: unknown
  output?: unknown
  approvalId?: string
  reason?: string
  text?: string
  steps?: number
  message?: string
}

interface BudgetState {
  used: number
  budget: number
  remaining: number
  warning: string
  scheduledUsed: number
  scheduledBudget: number
  periodKey: string
}

function mentionCandidates(typed: string): string[] {
  const q = typed.toLowerCase()
  const all = [...TOOL_IDS.map((id) => `@${id}`), ...Object.keys(TOOL_ALIASES).map((a) => `@${a}`)]
  return all.filter((c) => c.startsWith(`@${q}`))
}

/** Tiny markdown renderer (no deps, no raw HTML): fences, lists, bold, code, headings. */
function Markdown({ text }: { text: string }): React.JSX.Element {
  const blocks: React.JSX.Element[] = []
  const lines = text.split('\n')
  let i = 0
  let key = 0
  const inline = (s: string, k: string): React.ReactNode[] => {
    const parts: React.ReactNode[] = []
    const re = /(\*\*[^*]+\*\*|`[^`]+`)/g
    let last = 0
    let m: RegExpExecArray | null
    let n = 0
    while ((m = re.exec(s)) !== null) {
      if (m.index > last) parts.push(s.slice(last, m.index))
      const tok = m[0]
      if (tok.startsWith('**')) parts.push(<strong key={`${k}-${n++}`}>{tok.slice(2, -2)}</strong>)
      else parts.push(<code key={`${k}-${n++}`} className="rounded bg-neutral-800 px-1 font-mono text-[12px]">{tok.slice(1, -1)}</code>)
      last = m.index + tok.length
    }
    if (last < s.length) parts.push(s.slice(last))
    return parts
  }
  while (i < lines.length) {
    const line = lines[i] ?? ''
    if (line.trim().startsWith('```')) {
      const buf: string[] = []
      i++
      while (i < lines.length && !((lines[i] ?? '').trim().startsWith('```'))) {
        buf.push(lines[i] ?? '')
        i++
      }
      i++
      blocks.push(
        <pre key={key++} className="overflow-x-auto rounded bg-neutral-950 p-2 font-mono text-[12px] text-neutral-200">{buf.join('\n')}</pre>
      )
      continue
    }
    const h = /^(#{1,3})\s+(.*)$/.exec(line)
    if (h) {
      blocks.push(<div key={key++} className="pt-1 font-semibold text-neutral-100">{inline(h[2], `h${key}`)}</div>)
      i++
      continue
    }
    if (/^\s*([-*]|\d+[.)])\s+/.test(line)) {
      const items: string[] = []
      while (i < lines.length && /^\s*([-*]|\d+[.)])\s+/.test(lines[i] ?? '')) {
        items.push((lines[i] ?? '').replace(/^\s*([-*]|\d+[.)])\s+/, ''))
        i++
      }
      blocks.push(
        <ul key={key++} className="list-disc space-y-0.5 pl-5">
          {items.map((it, n) => <li key={n}>{inline(it, `li${key}-${n}`)}</li>)}
        </ul>
      )
      continue
    }
    if (line.trim() === '') {
      i++
      continue
    }
    blocks.push(<p key={key++} className="whitespace-pre-wrap break-words">{inline(line, `p${key}`)}</p>)
  }
  return <div className="space-y-1.5">{blocks}</div>
}

function shortJson(v: unknown, max = 300): string {
  try {
    const s = typeof v === 'string' ? v : JSON.stringify(v, null, 2)
    return s.length > max ? `${s.slice(0, max)}…` : s
  } catch {
    return String(v)
  }
}

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {}
}

function strList(v: unknown): string {
  if (Array.isArray(v)) return v.map((x) => String(x)).join(', ')
  return typeof v === 'string' ? v : ''
}

/**
 * Structured approve/deny card for Gmail writes: always shows To, Subject
 * and the FULL body before anything is sent. Falls back to raw JSON for
 * non-write tools.
 */
function ApprovalDetail({ toolName, input }: { toolName: string; input: unknown }): React.JSX.Element {
  const o = asRecord(input)
  const rows: Array<[string, string]> = []
  let body: string | null = null
  if (toolName === 'gmail_send' || toolName === 'gmail_draft') {
    if (o['to']) rows.push(['To', String(o['to'])])
    if (o['cc']) rows.push(['Cc', strList(o['cc'])])
    if (o['bcc']) rows.push(['Bcc', strList(o['bcc'])])
    if (o['subject']) rows.push(['Subject', String(o['subject'])])
    if (o['threadId']) rows.push(['Thread', String(o['threadId'])])
    if (typeof o['body'] === 'string') body = o['body']
  } else if (toolName === 'gmail_reply') {
    if (o['threadId']) rows.push(['Thread', String(o['threadId'])])
    if (o['to']) rows.push(['To', String(o['to'])])
    if (o['cc']) rows.push(['Cc', strList(o['cc'])])
    if (o['bcc']) rows.push(['Bcc', strList(o['bcc'])])
    if (typeof o['body'] === 'string') body = o['body']
  } else if (toolName === 'gmail_modify_labels') {
    if (o['messageId']) rows.push(['Message', String(o['messageId'])])
    if (o['addLabelIds']) rows.push(['Add labels', strList(o['addLabelIds'])])
    if (o['removeLabelIds']) rows.push(['Remove labels', strList(o['removeLabelIds'])])
  }
  if (rows.length === 0 && body === null) {
    return (
      <pre className="mt-1 max-h-32 overflow-y-auto whitespace-pre-wrap break-words rounded bg-black/40 p-2 font-mono text-xs text-neutral-200">
        {shortJson(input, 2000)}
      </pre>
    )
  }
  return (
    <div className="mt-1 rounded bg-black/40 p-2 text-xs">
      {rows.map(([k, v]) => (
        <div key={k} className="flex gap-2 py-0.5">
          <span className="w-16 shrink-0 text-neutral-400">{k}</span>
          <span className="break-words text-neutral-100">{v || '—'}</span>
        </div>
      ))}
      {body !== null && (
        <div className="pt-1">
          <div className="pb-0.5 text-neutral-400">Body</div>
          <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap break-words rounded bg-black/60 p-2 font-mono text-xs text-neutral-100">
            {body || '(empty)'}
          </pre>
        </div>
      )}
      <details className="pt-1 text-neutral-500">
        <summary className="cursor-pointer">Raw request</summary>
        <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap break-words pt-1 font-mono text-[11px]">
          {shortJson(input, 2000)}
        </pre>
      </details>
    </div>
  )
}

export default function PaletteApp(): React.JSX.Element {
  const [value, setValue] = useState('')
  const [caret, setCaret] = useState(0)
  const [selected, setSelected] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  const [shader, setShader] = useState(true)
  const inputRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const lastHeightRef = useRef(0)

  // Agent run state
  const [runId, setRunId] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [answer, setAnswer] = useState('')
  const [toolCalls, setToolCalls] = useState<ToolCallState[]>([])
  const [approvals, setApprovals] = useState<ApprovalState[]>([])
  const [runError, setRunError] = useState<string | null>(null)
  const [runSteps, setRunSteps] = useState<number | null>(null)
  const runIdRef = useRef<string | null>(null)
  runIdRef.current = runId
  // Events can arrive before the submit() invoke resolves (main emits on a
  // microtask; the invoke reply is a macrotask). Buffer them and replay once
  // the run id is known instead of dropping them.
  const earlyEventsRef = useRef<AgentEventMsg[]>([])

  function handleAgentEvent(e: AgentEventMsg): void {
    switch (e.type) {
      case 'text-delta':
        setAnswer((a) => a + (e.delta ?? ''))
        break
      case 'tool-call':
        if (e.toolName === 'web_search') setNotice('🔎 Searching the web…')
        if (e.toolName === 'write_file') setNotice('💾 Saving result…')
        setToolCalls((prev) => {
          if (prev.some((t) => t.toolCallId === e.toolCallId)) return prev
          return [...prev, { toolCallId: e.toolCallId ?? '', toolName: e.toolName ?? 'unknown', input: e.input ?? null, status: 'running' }]
        })
        break
      case 'tool-result':
        setToolCalls((prev) =>
          prev.map((t) => (t.toolCallId === e.toolCallId ? { ...t, status: 'done', output: e.output } : t))
        )
        break
      case 'approval-requested':
        setApprovals((prev) => {
          if (prev.some((a) => a.approvalId === e.approvalId)) return prev
          return [...prev, { approvalId: e.approvalId ?? '', toolCallId: e.toolCallId ?? '', toolName: e.toolName ?? 'unknown', input: e.input ?? null, reason: e.reason }]
        })
        setToolCalls((prev) =>
          prev.map((t) => (t.toolCallId === e.toolCallId ? { ...t, status: 'needs-approval' } : t))
        )
        break
      case 'done':
        setRunning(false)
        setAnswer(e.text ?? '')
        setRunSteps(e.steps ?? null)
        if ((e.text ?? '').trim().length > 0) setNotice('✓ Search complete')
        void refreshBudget()
        break
      case 'error':
        setRunning(false)
        setRunError(e.message ?? 'Agent run failed.')
        void refreshBudget()
        break
      case 'aborted':
        setRunning(false)
        setNotice('Run cancelled.')
        break
      default:
        break
    }
  }

  function adoptRunId(id: string): void {
    runIdRef.current = id
    setRunId(id)
    const buffered = earlyEventsRef.current.filter((ev) => ev.runId === id)
    earlyEventsRef.current = earlyEventsRef.current.filter((ev) => ev.runId !== id)
    for (const ev of buffered) handleAgentEvent(ev)
  }

  // Budget for the footer (full details live in Settings → Usage).
  const [budget, setBudget] = useState<BudgetState | null>(null)

  // Gmail connect state for the not-connected card below (polling shared with Settings).
  const gmail = useGmailConnect()

  const mention = useMemo(() => activeMention(value, caret), [value, caret])
  const candidates = useMemo(
    () => (mention ? mentionCandidates(mention.typed) : []),
    [mention]
  )
  const tools = useMemo(() => parseMentionedTools(value), [value])

  async function refreshBudget(): Promise<void> {
    try {
      setBudget((await window.palette.getBudget()) as BudgetState)
    } catch {
      /* ignore */
    }
  }

  // Auto-resize: report content height so main can setContentSize (clamped).
  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    let raf = 0
    const report = (): void => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        const h = Math.ceil(el.getBoundingClientRect().height) + 2
        if (Math.abs(h - lastHeightRef.current) >= 1) {
          lastHeightRef.current = h
          void window.palette.resize(h)
        }
      })
    }
    report()
    const ro = new ResizeObserver(report)
    ro.observe(el)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  useEffect(() => {
    const offOpened = window.palette.onOpened(() => {
      setNotice(null)
      inputRef.current?.focus()
      void window.palette.getAppBehavior().then((r) => {
        const res = r as unknown as { ok?: boolean; shader?: boolean }
        if (typeof res.shader === 'boolean') setShader(res.shader)
      }).catch(() => {})
    })
    const offSettings = window.palette.onOpenSettings(() => {
      window.palette.openSettingsWindow()
    })
    const offAgent = window.palette.onAgentEvent((raw) => {
      const e = raw as AgentEventMsg
      if (!e || !e.runId) return
      if (e.runId !== runIdRef.current) {
        // Unknown (usually early) run: buffer briefly, replay on adoptRunId.
        if (earlyEventsRef.current.length < 200) earlyEventsRef.current.push(e)
        return
      }
      handleAgentEvent(e)
    })
    void refreshBudget()
    void window.palette.getAppBehavior().then((r) => {
      const res = r as unknown as { ok?: boolean; shader?: boolean }
      if (typeof res.shader === 'boolean') setShader(res.shader)
    }).catch(() => {})
    const timer = setInterval(() => void refreshBudget(), 30_000)
    return () => {
      offOpened()
      offSettings()
      offAgent()
      clearInterval(timer)
    }
  }, [])

  useEffect(() => setSelected(0), [candidates.join(',')])

  function applyCandidate(c: string): void {
    if (!mention) return
    const after = value.slice(caret)
    const next = `${value.slice(0, mention.start)}${c} ${after}`
    setValue(next)
    const pos = mention.start + c.length + 1
    setCaret(pos)
    requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.setSelectionRange(pos, pos)
    })
  }

  async function submit(): Promise<void> {
    const text = value.trim()
    if (!text || running) return
    setNotice(null)
    setRunError(null)
    setAnswer('')
    setToolCalls([])
    setApprovals([])
    setRunSteps(null)
    setRunId(null)
    const res = (await window.palette.submit({
      text,
      tools: parseMentionedTools(text)
    })) as SubmitResponse
    if (!res.ok) {
      setNotice(res.error ?? 'Something went wrong.')
      return
    }
    if (res.action === 'calendar') {
      setNotice('Opening calendar with your draft…')
      return
    }
    if (res.action === 'scheduled' && res.routine) {
      setNotice(`Scheduled for ${new Date(res.routine.runAt).toLocaleString()} — the agent runs it then.`)
      setValue('')
      return
    }
    if (res.action === 'agent' && res.runId) {
      // Order matters: mark running first, then replay any events that
      // arrived before the invoke resolved (a fast error/done must win).
      setRunning(true)
      adoptRunId(res.runId)
      return
    }
    setNotice('Something went wrong.')
  }

  async function cancelRun(): Promise<void> {
    if (runId) {
      try {
        await window.palette.agentCancel(runId)
      } catch {
        /* run already finished */
      }
    } else {
      window.palette.hide()
    }
  }

  async function decide(approvalId: string, approved: boolean): Promise<void> {
    if (!runId) return
    setApprovals((prev) => prev.filter((a) => a.approvalId !== approvalId))
    await window.palette.agentApproval({ runId, approvalId, approved, reason: approved ? 'Approved in palette.' : 'Denied in palette.' })
    if (!approved) {
      setToolCalls((prev) =>
        prev.map((t) => (t.status === 'needs-approval' ? { ...t, status: 'denied' } : t))
      )
    }
  }

  async function copyResult(): Promise<void> {
    if (!answer) return
    try {
      await navigator.clipboard.writeText(answer)
      setNotice('Copied to clipboard.')
    } catch {
      setNotice('Copy failed — select the text manually.')
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      void copyResult()
      return
    }
    if (candidates.length > 0 && mention) {
      if (e.key === 'ArrowDown' || e.key === 'Tab') {
        e.preventDefault()
        setSelected((s) => (s + 1) % candidates.length)
        return
      }
      if (e.key === 'ArrowUp' && document.activeElement === inputRef.current && candidates.length > 0) {
        // Prefer candidate navigation when the menu is open.
        if (value.includes('@')) {
          e.preventDefault()
          setSelected((s) => (s - 1 + candidates.length) % candidates.length)
          return
        }
      }
      if (e.key === 'Enter' && candidates.length > 0 && mention.typed.length > 0 && !e.metaKey && !e.ctrlKey) {
        const exact = candidates.find((c) => c === `@${mention.typed.toLowerCase()}`)
        if (!exact) {
          e.preventDefault()
          const pick = candidates[selected] ?? candidates[0]
          if (pick) applyCandidate(pick)
          return
        }
      }
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      void submit()
      return
    }
    if (e.key === 'Escape') {
      if (running) {
        e.preventDefault()
        void cancelRun()
        return
      }
      window.palette.hide()
      return
    }
  }

  const budgetLabel = budget ? `Composio: ${budget.used} / ${budget.budget}` : 'Composio: …'
  const budgetWarn = budget?.warning === 'exceeded' || budget?.warning === 'warn90'

  return (
    <div ref={rootRef} className="relative mx-auto w-[720px] overflow-hidden rounded-xl border border-white/10 bg-[#121214]/92 shadow-2xl backdrop-blur-xl">
      <ShaderBackdrop enabled={shader} />
      <div className="relative z-10 flex items-center gap-2 px-4 pt-3">
        <span className="text-neutral-500">›</span>
        <input
          ref={inputRef}
          autoFocus
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            setCaret(e.target.selectionStart ?? e.target.value.length)
          }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
          onKeyDown={onKeyDown}
          placeholder="Type @ for tools…  (@calendar @notion at 6:30pm do X schedules it)"
          className="w-full bg-transparent text-[15px] text-neutral-100 outline-none placeholder:text-neutral-500"
        />
        {running && (
          <Button variant="destructive" size="sm" onClick={() => void cancelRun()} title="Cancel run (Esc)">
            Stop
          </Button>
        )}
        <Button variant="ghost" size="icon" onClick={() => window.palette.openSettingsWindow()} title="Settings" aria-label="Settings">
          ⚙
        </Button>
      </div>

      {tools.length > 0 && (
        <div className="relative z-10 flex flex-wrap gap-1 px-4 pt-2">
          {tools.map((t) => (
            <Badge key={t} variant="tool">
              @{t}
            </Badge>
          ))}
        </div>
      )}

      {mention && candidates.length > 0 && (
        <ul className="relative z-10 max-h-64 overflow-y-auto px-2 py-2">
          {candidates.map((c, i) => {
            const id = c.slice(1).toLowerCase()
            const meta = TOOL_META[(Object.keys(TOOL_META) as string[]).includes(id)
              ? (id as keyof typeof TOOL_META)
              : id === 'email'
                ? 'gmail'
                : id === 'sheet'
                  ? 'sheets'
                  : 'websearch']
            return (
              <li key={c}>
                <button
                  onClick={() => applyCandidate(c)}
                  className={`flex w-full items-center justify-between rounded-md px-3 py-1.5 text-left text-sm ${
                    i === selected ? 'bg-white/10 text-white' : 'text-neutral-300 hover:bg-white/5'
                  }`}
                >
                  <span className="font-mono">{c}</span>
                  <span className="text-xs text-neutral-400">{meta?.hint ?? ''}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {notice && (
        <div className="relative z-10 border-t border-white/8 px-4 py-2 text-sm text-neutral-300">
          {notice}
        </div>
      )}

      {(running || answer || toolCalls.length > 0 || runError || approvals.length > 0) && (
        <div className="relative z-10 max-h-80 overflow-y-auto border-t border-white/8 px-4 py-3 text-sm text-neutral-200">
          {toolCalls.length > 0 && (
            <div className="flex flex-wrap gap-1 pb-2">
              {toolCalls.map((t) => (
                <Badge
                  key={t.toolCallId}
                  title={shortJson(t.input)}
                  variant={
                    t.status === 'running'
                      ? 'busy'
                      : t.status === 'needs-approval'
                        ? 'alert'
                        : t.status === 'denied'
                          ? 'bad'
                          : 'ok'
                  }
                >
                  {t.toolName} · {t.status === 'running' ? 'running' : t.status === 'done' ? 'done' : t.status === 'needs-approval' ? 'needs approval' : 'denied'}
                </Badge>
              ))}
            </div>
          )}

          {approvals.map((a) => (
            <div key={a.approvalId} className="mb-2 rounded border border-orange-500/60 bg-orange-950/40 p-2">
              <div className="font-medium text-orange-100">
                Approval needed: <span className="font-mono">{a.toolName}</span>
                {(a.toolName === 'gmail_send' || a.toolName === 'gmail_reply') && (
                  <span className="ml-2 rounded bg-red-700 px-1.5 py-0.5 text-[11px]">sends immediately</span>
                )}
                {a.toolName === 'gmail_draft' && (
                  <span className="ml-2 rounded bg-sky-700 px-1.5 py-0.5 text-[11px]">draft only — nothing sent</span>
                )}
              </div>
              {a.reason && <div className="text-xs text-orange-200/80">{a.reason}</div>}
              <ApprovalDetail toolName={a.toolName} input={a.input} />
              <div className="flex gap-2 pt-2">
                <Button variant="success" size="sm" onClick={() => void decide(a.approvalId, true)}>
                  Approve
                </Button>
                <Button variant="destructive" size="sm" onClick={() => void decide(a.approvalId, false)}>
                  Deny
                </Button>
              </div>
            </div>
          ))}

          {runError && <div className="text-sm text-red-300">{runError}</div>}

          {!running &&
            toolCalls.some((t) => t.toolName.startsWith('gmail_')) &&
            /not connected/i.test(`${answer} ${runError ?? ''}`) && (
              <div className="mb-2">
                <Button variant="success" size="sm" onClick={() => void gmail.connect()} disabled={gmail.connecting}>
                  {gmail.connecting ? 'Waiting for Gmail…' : 'Connect Gmail'}
                </Button>
                {gmail.message && <div className="pt-1 text-xs text-amber-200">{gmail.message}</div>}
              </div>
            )}

          {answer && <Markdown text={answer} />}
          {running && !answer && (
            <div className="text-sm text-neutral-400">Thinking…</div>
          )}
          {runSteps !== null && !running && (
            <div className="pt-2 text-[11px] text-neutral-500">
              done in {runSteps} step{runSteps === 1 ? '' : 's'} · ⌘/Ctrl+Enter copies the answer
            </div>
          )}
        </div>
      )}

      <div className="relative z-10 flex items-center justify-between border-t border-white/8 px-4 py-1.5 text-[11px] text-neutral-500">
        <span className="flex items-center gap-1.5">
          <Kbd>↵</Kbd> run
          <Kbd>Esc</Kbd> {running ? 'cancel' : 'hide'}
          <span className="pl-1 text-neutral-600">@ tools: {TOOL_IDS.map((t) => `@${t}`).join(' ')}</span>
        </span>
        <span className={budgetWarn ? 'text-amber-300' : undefined}>{budgetLabel}</span>
      </div>
    </div>
  )
}
