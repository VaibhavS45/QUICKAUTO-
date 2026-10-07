import { useEffect, useMemo, useRef, useState } from 'react'
import { TOOL_IDS, TOOL_META, TOOL_ALIASES, parseMentionedTools } from '../../shared/types.js'
import '../styles.css'

interface SubmitResponse {
  ok: boolean
  action?: string
  tools?: string[]
  message?: string
  error?: string
}

interface HistoryEntry {
  text: string
  response: string
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

export default function PaletteApp(): React.JSX.Element {
  const [value, setValue] = useState('')
  const [caret, setCaret] = useState(0)
  const [selected, setSelected] = useState(0)
  const [result, setResult] = useState<string | null>(null)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [histIdx, setHistIdx] = useState(-1)
  const [showSettings, setShowSettings] = useState(false)
  const [hotkey, setHotkey] = useState('')
  const [hotkeyMsg, setHotkeyMsg] = useState<string | null>(null)
  const [platformHint, setPlatformHint] = useState<string | null>(null)
  const [hyprCmd, setHyprCmd] = useState<string | null>(null)
  const [isHyprland, setIsHyprland] = useState(false)
  const [copied, setCopied] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const mention = useMemo(() => activeMention(value, caret), [value, caret])
  const candidates = useMemo(
    () => (mention ? mentionCandidates(mention.typed) : []),
    [mention]
  )
  const tools = useMemo(() => parseMentionedTools(value), [value])

  useEffect(() => {
    const offOpened = window.palette.onOpened(() => {
      setResult(null)
      setShowSettings(false)
      inputRef.current?.focus()
    })
    const offSettings = window.palette.onOpenSettings(() => setShowSettings(true))
    const offErr = window.palette.onHotkeyError((msg) => setHotkeyMsg(msg))
    void window.palette.getHotkey().then((h) => {
      setHotkey(h.hotkey)
      if (h.error) setHotkeyMsg(h.error)
    })
    void window.palette.platformInfo().then(
      (p: { wayland: boolean; sessionType: string; hyprland?: boolean; toggleCommand?: string }) => {
        if (p.hyprland && p.toggleCommand) {
          setIsHyprland(true)
          setHyprCmd(p.toggleCommand)
          setPlatformHint(
            `Hyprland session: global hotkeys are unreliable, so bind a system key instead (the setup script adds it for you).`
          )
        } else if (p.wayland)
          setPlatformHint(
            `Wayland session (${p.sessionType}): global hotkeys are unreliable. Bind a system shortcut to quickauto --toggle if the hotkey fails.`
          )
      }
    )
    return () => {
      offOpened()
      offSettings()
      offErr()
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

  async function submit(copy = false): Promise<void> {
    const text = value.trim()
    if (!text) return
    const res = (await window.palette.submit({
      text,
      tools: parseMentionedTools(text)
    })) as SubmitResponse
    let message: string
    if (!res.ok) message = res.error ?? 'Something went wrong.'
    else if (res.action === 'calendar') message = 'Opening calendar with your draft…'
    else message = res.message ?? ''
    setResult(message)
    setHistory((h) => [{ text, response: message }, ...h].slice(0, 50))
    setHistIdx(-1)
    if (copy) {
      try {
        await navigator.clipboard.writeText(message)
      } catch {
        /* clipboard unavailable — ignore */
      }
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

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    if (candidates.length > 0 && mention) {
      if (e.key === 'ArrowDown' || e.key === 'Tab') {
        e.preventDefault()
        setSelected((s) => (s + 1) % candidates.length)
        return
      }
      if (e.key === 'ArrowUp' && document.activeElement === inputRef.current && candidates.length > 0 && histIdx === -1) {
        // Prefer candidate navigation when the menu is open.
        if (value.includes('@')) {
          e.preventDefault()
          setSelected((s) => (s - 1 + candidates.length) % candidates.length)
          return
        }
      }
      if (e.key === 'Enter' && candidates.length > 0 && mention.typed.length > 0) {
        const exact = candidates.find((c) => c === `@${mention.typed.toLowerCase()}`)
        if (!exact) {
          e.preventDefault()
          const pick = candidates[selected] ?? candidates[0]
          if (pick) applyCandidate(pick)
          return
        }
      }
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      void submit(true)
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      void submit(false)
      return
    }
    if (e.key === 'Escape') {
      window.palette.hide()
      return
    }
    if (e.key === 'ArrowUp' && history.length > 0 && candidates.length === 0) {
      e.preventDefault()
      const next = Math.min(histIdx + 1, history.length - 1)
      setHistIdx(next)
      const entry = history[next]
      if (entry) {
        setValue(entry.text)
        setCaret(entry.text.length)
      }
    }
  }

  return (
    <div className="mx-auto w-[720px] overflow-hidden rounded-xl border-2 border-black bg-white text-black shadow-2xl">
      <div className="flex items-center gap-2 px-4 pt-3">
        <span className="font-bold text-black">›</span>
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
          className="w-full bg-transparent text-[15px] text-black outline-none placeholder:text-neutral-500"
        />
        <button
          onClick={() => setShowSettings((s) => !s)}
          className="rounded px-1 text-neutral-600 hover:text-black"
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
                className="rounded bg-neutral-200 px-1.5 py-0.5 text-xs font-medium text-black"
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
                    i === selected ? 'bg-black text-white' : 'text-black hover:bg-neutral-200'
                  }`}
                >
                  <span className="font-mono">{c}</span>
                  <span className={`text-xs ${i === selected ? 'text-neutral-300' : 'text-neutral-600'}`}>{meta?.hint ?? ''}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {result && (
        <div className="border-t border-neutral-300 px-4 py-3 text-sm text-black">
          {result}
          <div className="pt-1 text-xs text-neutral-600">⌘/Ctrl+Enter copies the result.</div>
        </div>
      )}

      {showSettings && (
        <div className="border-t border-neutral-300 px-4 py-3 text-sm text-black">
          <div className="font-medium">Settings (M1: hotkey only)</div>
          {platformHint && <div className="pt-1 text-xs font-medium text-black">{platformHint}</div>}
          {isHyprland && hyprCmd && (
            <div className="flex items-center gap-2 pt-2">
              <code className="flex-1 overflow-x-auto rounded border border-black bg-neutral-100 px-2 py-1 font-mono text-xs text-black">
                {`o.bind("${hotkey
                  .split('+')
                  .map((s) => s.trim().toUpperCase())
                  .join(' + ')}", "QUICKauto", "${hyprCmd}")`}
              </code>
              <button
                onClick={() => {
                  const line = `o.bind("${hotkey
                    .split('+')
                    .map((s) => s.trim().toUpperCase())
                    .join(' + ')}", "QUICKauto", "${hyprCmd}")`
                  void navigator.clipboard
                    .writeText(line)
                    .then(() => setCopied(true))
                    .catch(() => setCopied(false))
                  window.setTimeout(() => setCopied(false), 2000)
                }}
                className="rounded bg-black px-2 py-1 text-xs text-white"
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          )}
          <div className="flex items-center gap-2 pt-2">
            <label className="text-xs text-neutral-600">Global hotkey</label>
            <input
              value={hotkey}
              onChange={(e) => setHotkey(e.target.value)}
              className="rounded border border-black bg-white px-2 py-1 font-mono text-xs text-black"
            />
            <button
              onClick={() => void saveHotkey()}
              className="rounded bg-black px-2 py-1 text-xs text-white"
            >
              Save
            </button>
          </div>
          {hotkeyMsg && (
            <div className="whitespace-pre-wrap pt-2 text-xs font-medium text-black">{hotkeyMsg}</div>
          )}
          <div className="pt-1 text-xs text-neutral-600">
            Providers, connections, granted folders and the Composio budget meter land in M2–M3.
          </div>
        </div>
      )}

      <div className="flex items-center justify-between border-t border-neutral-300 px-4 py-1.5 text-[11px] text-neutral-600">
        <span>Enter run · Esc hide · ↑ history · @ tools: {TOOL_IDS.map((t) => `@${t}`).join(' ')}</span>
        <span>Composio budget meter lands in M3</span>
      </div>
    </div>
  )
}
