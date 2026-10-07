import { useEffect, useMemo, useRef, useState } from 'react'
import { TOOL_IDS, TOOL_META, TOOL_ALIASES, parseMentionedTools } from '../../shared/types.js'
import '../styles.css'

interface SubmitResponse {
  ok: boolean
  action?: string
  tools?: string[]
  message?: string
  runId?: string
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

interface ModelState {
  provider: string
  model: string
  baseUrl?: string
  resetDay?: number
  keySet: boolean
  composioKeySet: boolean
  autoApprove?: string[]
  githubRepos?: Array<{ path: string; repo: string; testCommand?: string }>
  encryptionAvailable: boolean
}

interface ConnectionState {
  connected: boolean
  detail?: string
}

function mentionCandidates(typed: string): string[] {
  const q = typed.toLowerCase()
  const all = [...TOOL_IDS.map((id) => `@${id}`), ...Object.keys(TOOL_ALIASES).map((a) => `@${a}`)]
  return all.filter((c) => c.startsWith(`@${q}`))
}

/** Active @mention fragment being typed (letters right after the last @). */
function activeMention(value: string, caret: number): { start: number; typed: string } | null {
  const before = value.slice(0, caret)
  const m = /@([a-zA-Z]*)$/.exec(before)
  if (!m) return null
  // Must be at start or preceded by whitespace.
  const at = before.length - m[0].length
  if (at > 0 && !/\s/.test(before[at - 1])) return null
  return { start: at, typed: m[1] ?? '' }
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
 * and the FULL body before anything is sent. Falls back to raw JSON.
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
  const [showSettings, setShowSettings] = useState(false)
  const [hotkey, setHotkey] = useState('')
  const [hotkeyMsg, setHotkeyMsg] = useState<string | null>(null)
  const [platformHint, setPlatformHint] = useState<string | null>(null)
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

  // Settings state
  const [modelState, setModelState] = useState<ModelState | null>(null)
  const [provider, setProvider] = useState('anthropic')
  const [model, setModel] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [resetDay, setResetDay] = useState('1')
  const [apiKey, setApiKey] = useState('')
  const [autoApproveEcho, setAutoApproveEcho] = useState(false)
  const [settingsMsg, setSettingsMsg] = useState<string | null>(null)
  const [budget, setBudget] = useState<BudgetState | null>(null)

  // Connections state
  const [composioKey, setComposioKey] = useState('')
  const [gmailStatus, setGmailStatus] = useState<ConnectionState | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [connectMsg, setConnectMsg] = useState<string | null>(null)
  const [githubStatus, setGithubStatus] = useState<ConnectionState | null>(null)
  const [githubRepos, setGithubRepos] = useState<Array<{ path: string; repo: string; testCommand?: string }>>([])
  const [newRepoPath, setNewRepoPath] = useState('')
  const [newRepoName, setNewRepoName] = useState('')
  const [newRepoTests, setNewRepoTests] = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const mention = useMemo(() => activeMention(value, caret), [value, caret])
  const candidates = useMemo(
    () => (mention ? mentionCandidates(mention.typed) : []),
    [mention]
  )
  const tools = useMemo(() => parseMentionedTools(value), [value])

  async function refreshSettings(): Promise<void> {
    try {
      const s = (await window.palette.getModelSettings()) as ModelState
      setModelState(s)
      setProvider(s.provider)
      setModel(s.model)
      setBaseUrl(s.baseUrl ?? '')
      setResetDay(String(s.resetDay ?? 1))
      setAutoApproveEcho((s.autoApprove ?? []).includes('echo'))
      setGithubRepos(s.githubRepos ?? [])
    } catch {
      /* settings unavailable in this context */
    }
  }

  async function refreshBudget(): Promise<void> {
    try {
      setBudget((await window.palette.getBudget()) as BudgetState)
    } catch {
      /* ignore */
    }
  }

  async function refreshGmailStatus(): Promise<ConnectionState | null> {
    try {
      const res = (await window.palette.connectionStatus('gmail')) as {
        ok: boolean
        connected?: boolean
        detail?: string
      }
      if (!res.ok) return null
      const st = { connected: res.connected ?? false, detail: res.detail }
      setGmailStatus(st)
      return st
    } catch {
      return null
    }
  }

  async function refreshGithubStatus(): Promise<void> {
    try {
      const res = (await window.palette.connectionStatus('github')) as {
        ok: boolean
        connected?: boolean
        detail?: string
        error?: string
      }
      if (res.ok) setGithubStatus({ connected: res.connected ?? false, detail: res.detail })
      else setGithubStatus({ connected: false, detail: res.error })
    } catch {
      /* ignore */
    }
  }

  async function startGithubConnect(): Promise<void> {
    // gh auth login is interactive in the user's terminal; surface the fix.
    const res = (await window.palette.connectionConnect('github')) as {
      ok: boolean
      error?: string
    }
    if (res.ok) {
      await refreshGithubStatus()
    } else {
      setGithubStatus({ connected: false, detail: res.error })
    }
  }

  function stopPolling(): void {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  /** Open the Composio auth link (main opens the browser) and poll status up to 2 minutes. */
  async function startGmailConnect(): Promise<void> {
    stopPolling()
    setConnectMsg(null)
    const res = (await window.palette.connectionConnect('gmail')) as {
      ok: boolean
      url?: string
      error?: string
    }
    if (!res.ok) {
      setConnectMsg(res.error ?? 'Could not start Gmail connection.')
      return
    }
    const st = await refreshGmailStatus()
    if (st?.connected) {
      setConnectMsg('Gmail is connected.')
      return
    }
    setConnecting(true)
    setConnectMsg('Browser opened — approve Gmail access there. Waiting up to 2 minutes…')
    const deadline = Date.now() + 120_000
    pollRef.current = setInterval(() => {
      void (async () => {
        const cur = await refreshGmailStatus()
        if (cur?.connected) {
          stopPolling()
          setConnecting(false)
          setConnectMsg('Gmail connected. Ask your question again.')
          void refreshBudget()
        } else if (Date.now() > deadline) {
          stopPolling()
          setConnecting(false)
          setConnectMsg('Timed out waiting (2 min). Press Connect Gmail to try again.')
        }
      })()
    }, 3000)
  }

  async function saveComposioKey(): Promise<void> {
    if (!composioKey.trim()) return
    setConnectMsg(null)
    const res = (await window.palette.setComposioKey(composioKey.trim())) as {
      ok: boolean
      error?: string
    }
    if (!res.ok) {
      setConnectMsg(res.error ?? 'Key save failed.')
      return
    }
    setComposioKey('')
    setConnectMsg('Composio key saved.')
    await refreshSettings()
  }

  async function clearComposioKey(): Promise<void> {
    await window.palette.clearComposioKey()
    setGmailStatus(null)
    setConnectMsg('Composio key removed.')
    await refreshSettings()
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
      setShowSettings(false)
      inputRef.current?.focus()
    })
    const offSettings = window.palette.onOpenSettings(() => {
      setShowSettings(true)
      void refreshSettings()
      void refreshGmailStatus()
      void refreshGithubStatus()
    })
    const offErr = window.palette.onHotkeyError((msg) => setHotkeyMsg(msg))
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
    void window.palette.getHotkey().then((h) => {
      setHotkey(h.hotkey)
      if (h.error) setHotkeyMsg(h.error)
    })
    void window.palette.platformInfo().then((p: { wayland: boolean; sessionType: string }) => {
      if (p.wayland)
        setPlatformHint(
          `Wayland session (${p.sessionType}): global hotkeys are unreliable. Bind a system shortcut to palette --toggle if the hotkey fails.`
        )
    })
    void refreshSettings()
    void refreshBudget()
    void refreshGmailStatus()
    void refreshGithubStatus()
    const timer = setInterval(() => void refreshBudget(), 30_000)
    return () => {
      offOpened()
      offSettings()
      offErr()
      offAgent()
      clearInterval(timer)
      stopPolling()
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

  async function saveHotkey(): Promise<void> {
    setHotkeyMsg(null)
    const res = (await window.palette.setHotkey(hotkey)) as {
      ok: boolean
      error: string | null
    }
    setHotkeyMsg(res.ok ? 'Hotkey registered.' : (res.error ?? 'Registration failed.'))
  }

  async function saveModelSettings(): Promise<void> {
    setSettingsMsg(null)
    const rd = Math.min(28, Math.max(1, parseInt(resetDay, 10) || 1))
    const res = (await window.palette.setModelSettings({
      provider,
      model: model.trim(),
      baseUrl: baseUrl.trim() || undefined,
      resetDay: rd,
      autoApprove: autoApproveEcho ? ['echo'] : [],
      githubRepos
    })) as { ok: boolean; error?: string }
    if (!res.ok) {
      setSettingsMsg(res.error ?? 'Save failed.')
      return
    }
    if (apiKey.trim()) {
      const kr = (await window.palette.setApiKey(apiKey.trim())) as { ok: boolean; error?: string }
      if (!kr.ok) {
        setSettingsMsg(kr.error ?? 'Key save failed.')
        return
      }
      setApiKey('')
    }
    setSettingsMsg('Saved.')
    await refreshSettings()
  }

  async function clearKey(): Promise<void> {
    await window.palette.clearApiKey()
    setSettingsMsg('API key removed.')
    await refreshSettings()
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
    <div ref={rootRef} className="mx-auto w-[720px] overflow-hidden rounded-xl border border-neutral-700 bg-neutral-900/95 shadow-2xl backdrop-blur">
      <div className="flex items-center gap-2 px-4 pt-3">
        <span className="text-neutral-400">›</span>
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
          placeholder="Type @ for tools…  (@calendar opens a task draft)"
          className="w-full bg-transparent text-[15px] text-neutral-100 outline-none placeholder:text-neutral-500"
        />
        {running && (
          <button
            onClick={() => void cancelRun()}
            className="rounded bg-red-700 px-2 py-0.5 text-xs text-white"
            title="Cancel run (Esc)"
          >
            Stop
          </button>
        )}
        <button
          onClick={() => {
            setShowSettings((s) => !s)
            void refreshSettings()
            void refreshGmailStatus()
            void refreshGithubStatus()
          }}
          className="rounded px-1 text-neutral-500 hover:text-neutral-200"
          title="Settings"
        >
          ⚙
        </button>
      </div>

      {tools.length > 0 && (
        <div className="flex flex-wrap gap-1 px-4 pt-2">
          {tools.map((t) => (
            <span
              key={t}
              className="rounded bg-indigo-600/30 px-1.5 py-0.5 text-xs text-indigo-200"
            >
              @{t}
            </span>
          ))}
        </div>
      )}

      {mention && candidates.length > 0 && (
        <ul className="max-h-64 overflow-y-auto px-2 py-2">
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
                  className={`flex w-full items-center justify-between rounded px-3 py-1.5 text-left text-sm ${
                    i === selected ? 'bg-indigo-600/40 text-white' : 'text-neutral-300'
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
        <div className="border-t border-neutral-800 px-4 py-2 text-sm text-neutral-300">
          {notice}
        </div>
      )}

      {(running || answer || toolCalls.length > 0 || runError || approvals.length > 0) && (
        <div className="max-h-80 overflow-y-auto border-t border-neutral-800 px-4 py-3 text-sm text-neutral-200">
          {toolCalls.length > 0 && (
            <div className="flex flex-wrap gap-1 pb-2">
              {toolCalls.map((t) => (
                <span
                  key={t.toolCallId}
                  title={shortJson(t.input)}
                  className={`rounded px-1.5 py-0.5 font-mono text-xs ${
                    t.status === 'running'
                      ? 'bg-amber-600/30 text-amber-200'
                      : t.status === 'needs-approval'
                        ? 'bg-orange-600/40 text-orange-100'
                        : t.status === 'denied'
                          ? 'bg-red-800/50 text-red-200'
                          : 'bg-emerald-700/30 text-emerald-200'
                  }`}
                >
                  {t.toolName} · {t.status === 'running' ? 'running' : t.status === 'done' ? 'done' : t.status === 'needs-approval' ? 'needs approval' : 'denied'}
                </span>
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
                <button
                  onClick={() => void decide(a.approvalId, true)}
                  className="rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white"
                >
                  Approve
                </button>
                <button
                  onClick={() => void decide(a.approvalId, false)}
                  className="rounded bg-red-700 px-3 py-1 text-xs font-medium text-white"
                >
                  Deny
                </button>
              </div>
            </div>
          ))}

          {runError && <div className="text-sm text-red-300">{runError}</div>}

          {!running &&
            toolCalls.some((t) => t.toolName.startsWith('gmail_')) &&
            /not connected/i.test(`${answer} ${runError ?? ''}`) && (
              <div className="mb-2">
                <button
                  onClick={() => void startGmailConnect()}
                  disabled={connecting}
                  className="rounded bg-emerald-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                >
                  {connecting ? 'Waiting for Gmail…' : 'Connect Gmail'}
                </button>
                {connectMsg && <div className="pt-1 text-xs text-amber-200">{connectMsg}</div>}
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

      {showSettings && (
        <div className="max-h-80 overflow-y-auto border-t border-neutral-800 px-4 py-3 text-sm text-neutral-200">
          <div className="font-medium">Settings</div>
          {platformHint && <div className="pt-1 text-xs text-amber-300">{platformHint}</div>}
          <div className="flex items-center gap-2 pt-2">
            <label className="text-xs text-neutral-400">Global hotkey</label>
            <input
              value={hotkey}
              onChange={(e) => setHotkey(e.target.value)}
              className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1 font-mono text-xs text-neutral-100"
            />
            <button
              onClick={() => void saveHotkey()}
              className="rounded bg-indigo-600 px-2 py-1 text-xs text-white"
            >
              Save
            </button>
          </div>
          {hotkeyMsg && (
            <div className="whitespace-pre-wrap pt-2 text-xs text-amber-200">{hotkeyMsg}</div>
          )}

          <div className="pt-3 font-medium">Model</div>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <label className="text-xs text-neutral-400">
              Provider
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="mt-0.5 w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 text-xs text-neutral-100"
              >
                <option value="anthropic">anthropic</option>
                <option value="openai">openai</option>
                <option value="openai-compatible">openai-compatible (custom base URL)</option>
              </select>
            </label>
            <label className="text-xs text-neutral-400">
              Model
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="claude-sonnet-4-5"
                className="mt-0.5 w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 font-mono text-xs text-neutral-100"
              />
            </label>
          </div>
          {provider === 'openai-compatible' && (
            <label className="block pt-2 text-xs text-neutral-400">
              Base URL
              <input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="http://localhost:11434/v1"
                className="mt-0.5 w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1 font-mono text-xs text-neutral-100"
              />
            </label>
          )}
          <div className="flex flex-wrap items-end gap-2 pt-2">
            <label className="text-xs text-neutral-400">
              API key {modelState?.keySet ? '(set ✓)' : '(not set)'}
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={modelState?.keySet ? '•••••• (enter to replace)' : 'sk-…'}
                className="mt-0.5 w-64 rounded border border-neutral-700 bg-neutral-800 px-2 py-1 font-mono text-xs text-neutral-100"
              />
            </label>
            <label className="text-xs text-neutral-400">
              Budget reset day
              <input
                value={resetDay}
                onChange={(e) => setResetDay(e.target.value)}
                inputMode="numeric"
                className="mt-0.5 w-16 rounded border border-neutral-700 bg-neutral-800 px-2 py-1 font-mono text-xs text-neutral-100"
              />
            </label>
            <button
              onClick={() => void saveModelSettings()}
              className="rounded bg-indigo-600 px-2 py-1 text-xs text-white"
            >
              Save model
            </button>
            {modelState?.keySet && (
              <button
                onClick={() => void clearKey()}
                className="rounded border border-neutral-600 px-2 py-1 text-xs text-neutral-300"
              >
                Remove key
              </button>
            )}
          </div>
          {settingsMsg && <div className="pt-1 text-xs text-amber-200">{settingsMsg}</div>}
          <div className="pt-1 text-[11px] text-neutral-500">
            Keys are encrypted with the OS keychain (safeStorage) and never leave the main process.
            {modelState && !modelState.encryptionAvailable && ' Warning: OS encryption unavailable on this machine.'}
          </div>

          <div className="pt-3 font-medium">Auto-approve</div>
          <label className="flex items-center gap-2 pt-1 text-xs text-neutral-300">
            <input
              type="checkbox"
              checked={autoApproveEcho}
              onChange={(e) => setAutoApproveEcho(e.target.checked)}
            />
            echo (harmless test tool) — runs without asking
          </label>
          <div className="pt-1 text-[11px] text-neutral-500">
            Default: everything asks. Writes (email send/draft/reply/labels) always need approval
            and can never auto-approve; scheduled runs never auto-approve anything.
          </div>

          <div className="pt-3 font-medium">Composio budget</div>
          <div className="pt-1 text-xs text-neutral-300">
            {budget ? (
              <>
                Used {budget.used} / {budget.budget} this period ({budget.periodKey}); scheduled share{' '}
                {budget.scheduledUsed} / {budget.scheduledBudget}.{' '}
                {budget.warning !== 'none' && (
                  <span className="text-amber-300">Warning: {budget.warning}.</span>
                )}{' '}
                Source of truth: the Composio dashboard usage page.
              </>
            ) : (
              'Loading…'
            )}
          </div>

          <div className="pt-3 font-medium">Connections</div>
          <div className="flex flex-wrap items-end gap-2 pt-1">
            <label className="text-xs text-neutral-400">
              Composio API key {modelState?.composioKeySet ? '(set ✓)' : '(not set)'}
              <input
                type="password"
                value={composioKey}
                onChange={(e) => setComposioKey(e.target.value)}
                placeholder={modelState?.composioKeySet ? '•••••• (enter to replace)' : 'composio key…'}
                className="mt-0.5 w-64 rounded border border-neutral-700 bg-neutral-800 px-2 py-1 font-mono text-xs text-neutral-100"
              />
            </label>
            <button
              onClick={() => void saveComposioKey()}
              className="rounded bg-indigo-600 px-2 py-1 text-xs text-white"
            >
              Save key
            </button>
            {modelState?.composioKeySet && (
              <button
                onClick={() => void clearComposioKey()}
                className="rounded border border-neutral-600 px-2 py-1 text-xs text-neutral-300"
              >
                Remove
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 pt-2 text-xs">
            <span className="text-neutral-400">
              Gmail {gmailStatus ? (gmailStatus.connected ? 'connected ✓' : 'not connected') : '…'}
            </span>
            {gmailStatus && !gmailStatus.connected && (
              <button
                onClick={() => void startGmailConnect()}
                disabled={connecting}
                className="rounded bg-emerald-600 px-2 py-1 text-xs text-white disabled:opacity-50"
              >
                {connecting ? 'Waiting…' : 'Connect Gmail'}
              </button>
            )}
            {connecting && (
              <button
                onClick={() => {
                  stopPolling()
                  setConnecting(false)
                  setConnectMsg('Stopped waiting.')
                }}
                className="rounded border border-neutral-600 px-2 py-1 text-xs text-neutral-300"
              >
                Stop waiting
              </button>
            )}
            <button
              onClick={() => void refreshGmailStatus()}
              className="rounded border border-neutral-600 px-2 py-1 text-xs text-neutral-300"
            >
              Refresh
            </button>
          </div>
          {gmailStatus?.detail && <div className="pt-1 text-[11px] text-neutral-500">{gmailStatus.detail}</div>}
          {connectMsg && <div className="pt-1 text-xs text-amber-200">{connectMsg}</div>}

          <div className="pt-3 font-medium">GitHub (local gh CLI — costs no Composio calls)</div>
          <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
            <span className="text-neutral-400">
              {githubStatus ? (githubStatus.connected ? 'ready ✓' : 'not ready') : '…'}
            </span>
            <button
              onClick={() => void startGithubConnect()}
              className="rounded border border-neutral-600 px-2 py-1 text-xs text-neutral-300"
            >
              Check / fix
            </button>
            <button
              onClick={() => void refreshGithubStatus()}
              className="rounded border border-neutral-600 px-2 py-1 text-xs text-neutral-300"
            >
              Refresh
            </button>
          </div>
          {githubStatus?.detail && <div className="pt-1 text-[11px] text-neutral-500">{githubStatus.detail}</div>}
          <div className="pt-2 text-xs text-neutral-400">Repos (only these are accessible to @github)</div>
          {githubRepos.map((r, i) => (
            <div key={`${r.repo}-${i}`} className="flex items-center gap-2 pt-1 text-xs">
              <span className="font-mono text-neutral-200">{r.repo}</span>
              <span className="truncate font-mono text-[11px] text-neutral-500">{r.path}</span>
              {r.testCommand && <span className="truncate font-mono text-[11px] text-neutral-500">tests: {r.testCommand}</span>}
              <button
                onClick={() => setGithubRepos((prev) => prev.filter((_, j) => j !== i))}
                className="rounded border border-neutral-600 px-1.5 py-0.5 text-[11px] text-neutral-300"
              >
                Remove
              </button>
            </div>
          ))}
          <div className="flex flex-wrap items-end gap-2 pt-2">
            <label className="text-xs text-neutral-400">
              Local path
              <input
                value={newRepoPath}
                onChange={(e) => setNewRepoPath(e.target.value)}
                placeholder="/home/user/code/repo"
                className="mt-0.5 w-64 rounded border border-neutral-700 bg-neutral-800 px-2 py-1 font-mono text-xs text-neutral-100"
              />
            </label>
            <label className="text-xs text-neutral-400">
              owner/name
              <input
                value={newRepoName}
                onChange={(e) => setNewRepoName(e.target.value)}
                placeholder="owner/name"
                className="mt-0.5 w-40 rounded border border-neutral-700 bg-neutral-800 px-2 py-1 font-mono text-xs text-neutral-100"
              />
            </label>
            <label className="text-xs text-neutral-400">
              Test command (optional)
              <input
                value={newRepoTests}
                onChange={(e) => setNewRepoTests(e.target.value)}
                placeholder="npm test"
                className="mt-0.5 w-40 rounded border border-neutral-700 bg-neutral-800 px-2 py-1 font-mono text-xs text-neutral-100"
              />
            </label>
            <button
              onClick={() => {
                if (!newRepoPath.trim() || !newRepoName.trim()) return
                setGithubRepos((prev) => [
                  ...prev,
                  {
                    path: newRepoPath.trim(),
                    repo: newRepoName.trim(),
                    ...(newRepoTests.trim() ? { testCommand: newRepoTests.trim() } : {})
                  }
                ])
                setNewRepoPath('')
                setNewRepoName('')
                setNewRepoTests('')
              }}
              className="rounded bg-indigo-600 px-2 py-1 text-xs text-white"
            >
              Add
            </button>
          </div>
          <div className="pt-1 text-[11px] text-neutral-500">
            Press “Save model” above to validate and store the list. Paths must exist and be git repos;
            a GitHub origin must match owner/name. Never reads your gh token.
          </div>
        </div>
      )}

      <div className="flex items-center justify-between border-t border-neutral-800 px-4 py-1.5 text-[11px] text-neutral-500">
        <span>Enter run · Esc {running ? 'cancel' : 'hide'} · @ tools: {TOOL_IDS.map((t) => `@${t}`).join(' ')}</span>
        <span className={budgetWarn ? 'text-amber-300' : undefined}>{budgetLabel}</span>
      </div>
    </div>
  )
}
