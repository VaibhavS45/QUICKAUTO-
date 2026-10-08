import { useEffect, useMemo, useRef, useState } from 'react'
import { useGmailConnect } from '../hooks/useGmailConnect.js'

export type SettingsTabId = 'general' | 'model' | 'connections' | 'routines' | 'shortcuts' | 'usage'

export interface SettingsNavItem {
  id: SettingsTabId
  label: string
}

export const SETTINGS_NAV: SettingsNavItem[] = [
  { id: 'general', label: 'General' },
  { id: 'model', label: 'Model' },
  { id: 'connections', label: 'Connections' },
  { id: 'routines', label: 'Routines' },
  { id: 'shortcuts', label: 'Shortcuts' },
  { id: 'usage', label: 'Usage' }
]

/** Case-insensitive sidebar filter. Pure for unit testing. */
export function filterSettingsNav(query: string): SettingsNavItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return SETTINGS_NAV
  return SETTINGS_NAV.filter((n) => n.label.toLowerCase().includes(q))
}

interface Profile {
  name: string
  email: string
  about: string
  language: string
}

interface ModelState {
  provider: string
  model: string
  baseUrl?: string
  resetDay?: number
  autoApprove?: string[]
  keySet: boolean
  encryptionAvailable: boolean
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

interface ConnectorState {
  configured: boolean
  services: Array<{ id: string; connected: boolean; detail?: string }>
}

interface RoutineItem {
  id: string
  prompt: string
  tools: string[]
  runAt: number
  enabled: boolean
  lastStatus?: string
}

const inputCls =
  'h-9 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 text-sm text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-blue-500'
const cardCls = 'rounded-xl border border-neutral-800 bg-neutral-900 p-4'
const labelCls = 'text-xs font-medium text-neutral-300'
const hintCls = 'pt-1 text-xs leading-relaxed text-neutral-400'

function Field({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <label className="block">
      <span className={labelCls}>{label}</span>
      <span className="mt-1 block">{children}</span>
    </label>
  )
}

function GeneralPanel(): React.JSX.Element {
  const [profile, setProfile] = useState<Profile>({ name: '', email: '', about: '', language: 'system' })
  const [status, setStatus] = useState('Loading…')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const first = useRef(true)

  useEffect(() => {
    let live = true
    window.palette
      .getProfile()
      .then((r) => {
        const res = r as unknown as Partial<Profile>
        if (live && typeof res.name === 'string') {
          setProfile({ name: res.name ?? '', email: res.email ?? '', about: res.about ?? '', language: res.language ?? 'system' })
          setStatus('Saved as you go.')
        }
      })
      .catch(() => live && setStatus('Could not load profile.'))
    return () => {
      live = false
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  function patch(p: Partial<Profile>): void {
    const next = { ...profile, ...p }
    setProfile(next)
    setStatus('Saving…')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      // Skip the debounce that fires from the initial load.
      if (first.current) {
        first.current = false
        setStatus('Saved as you go.')
        return
      }
      window.palette
        .setProfile(next)
        .then((r) => setStatus((r as { ok: boolean; error?: string }).ok ? 'Saved as you go.' : ((r as { error?: string }).error ?? 'Save failed.')))
        .catch(() => setStatus('Save failed.'))
    }, 500)
  }

  // Mark hydration done once the profile arrives.
  useEffect(() => {
    if (profile.name || profile.email || profile.about) first.current = false
  }, [profile.name, profile.email, profile.about])

  return (
    <div className="space-y-4">
      <section className={cardCls}>
        <h3 className="text-sm font-semibold text-neutral-100">Profile</h3>
        <p className="pt-0.5 text-xs text-neutral-400">Your details and shared context. {status}</p>
        <div className="space-y-3 pt-3">
          <input
            value={profile.name}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder="Your name"
            aria-label="Your name"
            className={inputCls}
          />
          <input
            value={profile.email}
            onChange={(e) => patch({ email: e.target.value })}
            placeholder="you@example.com"
            aria-label="Email"
            inputMode="email"
            className={inputCls}
          />
          <div>
            <div className="flex items-center gap-1.5">
              <span className={labelCls}>About me</span>
              <span title="Shared with the agent as background context." className="cursor-help text-neutral-500">
                ?
              </span>
            </div>
            <textarea
              value={profile.about}
              onChange={(e) => patch({ about: e.target.value })}
              rows={5}
              aria-label="About me"
              className="mt-1 min-h-24 w-full resize-y rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-blue-500"
            />
          </div>
        </div>
      </section>
      <section className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-neutral-100">Language</h3>
          <p className="max-w-md pt-1 text-xs leading-relaxed text-neutral-400">
            The app follows your system language unless you pick one here. Only part of the interface is translated
            so far — untranslated text stays in English.
          </p>
        </div>
        <select
          value={profile.language}
          onChange={(e) => patch({ language: e.target.value })}
          aria-label="Language"
          className="h-9 shrink-0 rounded-md border border-neutral-700 bg-neutral-900 px-3 text-sm text-neutral-100 outline-none focus:border-blue-500"
        >
          <option value="system">System</option>
          <option value="en">English</option>
        </select>
      </section>
    </div>
  )
}

function ModelPanel(): React.JSX.Element {
  const [s, setS] = useState<ModelState | null>(null)
  const [provider, setProvider] = useState('anthropic')
  const [model, setModel] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [resetDay, setResetDay] = useState('1')
  const [autoApproveEcho, setAutoApproveEcho] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    window.palette
      .getModelSettings()
      .then((v) => {
        const m = v as ModelState
        setS(m)
        setProvider(m.provider)
        setModel(m.model)
        setBaseUrl(m.baseUrl ?? '')
        setResetDay(String(m.resetDay ?? 1))
        setAutoApproveEcho((m.autoApprove ?? []).includes('echo'))
      })
      .catch(() => {})
  }, [])

  async function save(): Promise<void> {
    setMsg(null)
    const rd = Math.min(28, Math.max(1, parseInt(resetDay, 10) || 1))
    const res = (await window.palette.setModelSettings({
      provider,
      model: model.trim(),
      baseUrl: baseUrl.trim() || undefined,
      resetDay: rd,
      autoApprove: autoApproveEcho ? ['echo'] : []
    })) as { ok: boolean; error?: string }
    if (!res.ok) {
      setMsg(res.error ?? 'Save failed.')
      return
    }
    if (apiKey.trim()) {
      const kr = (await window.palette.setApiKey(apiKey.trim())) as { ok: boolean; error?: string }
      if (!kr.ok) {
        setMsg(kr.error ?? 'Key save failed.')
        return
      }
      setApiKey('')
    }
    setMsg('Saved.')
    setS((await window.palette.getModelSettings()) as ModelState)
  }

  return (
    <div className="space-y-4">
      <section className={cardCls}>
        <h3 className="text-sm font-semibold text-neutral-100">Model</h3>
        <p className="pt-0.5 text-xs text-neutral-400">Provider, model, and encrypted API key.</p>
        <div className="grid grid-cols-2 gap-3 pt-3">
          <Field label="Provider">
            <select value={provider} onChange={(e) => setProvider(e.target.value)} className={inputCls}>
              <option value="anthropic">anthropic</option>
              <option value="openai">openai</option>
              <option value="openai-compatible">openai-compatible</option>
            </select>
          </Field>
          <Field label="Model">
            <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="claude-sonnet-4-5" className={`${inputCls} font-mono text-xs`} />
          </Field>
        </div>
        {provider === 'openai-compatible' && (
          <div className="pt-3">
            <Field label="Base URL">
              <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="http://localhost:11434/v1" className={`${inputCls} font-mono text-xs`} />
            </Field>
          </div>
        )}
        <div className="flex flex-wrap items-end gap-2 pt-3">
          <div className="min-w-52 flex-1">
            <Field label={`API key ${s?.keySet ? '(set ✓)' : '(not set)'}`}>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={s?.keySet ? '•••••• (enter to replace)' : 'sk-…'}
                className={`${inputCls} font-mono text-xs`}
              />
            </Field>
          </div>
          <Field label="Reset day">
            <input value={resetDay} onChange={(e) => setResetDay(e.target.value)} inputMode="numeric" className="h-9 w-16 rounded-md border border-neutral-700 bg-neutral-950 px-2 font-mono text-xs text-neutral-100 outline-none focus:border-blue-500" />
          </Field>
          <button onClick={() => void save()} className="h-9 rounded-md bg-blue-500 px-4 text-sm font-medium text-white hover:bg-blue-400">
            Save
          </button>
        </div>
        {msg && <p className="pt-2 text-xs text-amber-200">{msg}</p>}
        <p className={hintCls}>Keys are encrypted with the OS keychain (safeStorage) and never leave the main process.</p>
      </section>
      <section className={cardCls}>
        <h3 className="text-sm font-semibold text-neutral-100">Auto-approve</h3>
        <label className="flex items-center gap-2 pt-2 text-xs text-neutral-300">
          <input
            type="checkbox"
            checked={autoApproveEcho}
            onChange={(e) => setAutoApproveEcho(e.target.checked)}
          />
          echo (harmless test tool) — runs without asking
        </label>
        <p className={hintCls}>
          Default: everything asks. Writes (email draft/send/reply/labels) always need approval
          and can never auto-approve; scheduled runs never auto-approve anything.
        </p>
      </section>
    </div>
  )
}

function ConnectionsPanel(): React.JSX.Element {
  const [state, setState] = useState<ConnectorState | null>(null)
  const [key, setKey] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => {
    window.palette.getConnector().then((v) => setState(v as ConnectorState)).catch(() => {})
  }, [])
  async function save(): Promise<void> {
    setMsg(null)
    const res = (await window.palette.setConnectorKey(key.trim())) as { ok: boolean; error?: string }
    if (!res.ok) {
      setMsg(res.error ?? 'Save failed.')
      return
    }
    setKey('')
    setMsg('Saved.')
    setState((await window.palette.getConnector()) as ConnectorState)
  }
  return (
    <section className={cardCls}>
      <h3 className="text-sm font-semibold text-neutral-100">Connections</h3>
      <p className="pt-0.5 text-xs text-neutral-400">
        One Composio project key unlocks @notion, @gmail, @sheets, @websearch. Keys stay encrypted in the main process.
      </p>
      <div className="flex flex-wrap items-end gap-2 pt-3">
        <div className="min-w-52 flex-1">
          <Field label="Composio project key">
            <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder={state?.configured ? '•••••• (enter to replace)' : 'ak_…'} className={`${inputCls} font-mono text-xs`} />
          </Field>
        </div>
        <button onClick={() => void save()} className="h-9 rounded-md bg-blue-500 px-4 text-sm font-medium text-white hover:bg-blue-400">
          Save
        </button>
      </div>
      {msg && <p className="pt-2 text-xs text-amber-200">{msg}</p>}
      {state && (
        <div className="flex flex-wrap gap-1.5 pt-3">
          {state.services.map((sv) => (
            <span key={sv.id} title={sv.detail ?? ''} className={`rounded-full px-2.5 py-0.5 font-mono text-xs ${sv.connected ? 'bg-emerald-600/20 text-emerald-200' : 'bg-neutral-800 text-neutral-400'}`}>
              @{sv.id} {sv.connected ? '✓' : '○'}
            </span>
          ))}
        </div>
      )}
      <GmailConnectBlock />
    </section>
  )
}

function GmailConnectBlock(): React.JSX.Element {
  const g = useGmailConnect()
  return (
    <div className="pt-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-neutral-400">
          Gmail {g.status ? (g.status.connected ? 'connected ✓' : 'not connected') : '…'}
        </span>
        {g.status && !g.status.connected && (
          <button
            onClick={() => void g.connect()}
            disabled={g.connecting}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            {g.connecting ? 'Waiting…' : 'Connect Gmail'}
          </button>
        )}
        <button
          onClick={() => void g.refresh()}
          className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-300"
        >
          Refresh
        </button>
      </div>
      {g.status?.detail && <p className="pt-1 text-[11px] text-neutral-500">{g.status.detail}</p>}
      {g.message && <p className="pt-1 text-xs text-amber-200">{g.message}</p>}
    </div>
  )
}

function RoutinesPanel(): React.JSX.Element {
  const [items, setItems] = useState<RoutineItem[]>([])
  useEffect(() => {
    window.palette.routineList().then((r) => {
      const res = r as { ok: boolean; routines: RoutineItem[] }
      if (res.ok) setItems(res.routines)
    }).catch(() => {})
  }, [])
  async function refresh(): Promise<void> {
    const res = (await window.palette.routineList()) as { ok: boolean; routines: RoutineItem[] }
    if (res.ok) setItems(res.routines)
  }
  return (
    <section className={cardCls}>
      <h3 className="text-sm font-semibold text-neutral-100">Routines ({items.length})</h3>
      <p className="pt-0.5 text-xs text-neutral-400">
        Type <span className="font-mono">@calendar @notion at 6:30pm summarize my tasks</span> — the agent runs it at that time.
      </p>
      <div className="space-y-1.5 pt-3">
        {items.length === 0 && <p className="text-xs text-neutral-500">No routines yet.</p>}
        {items.map((r) => (
          <div key={r.id} className="flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-950 px-2.5 py-2 text-xs">
            <button
              onClick={() => void window.palette.routineToggle(r.id, !r.enabled).then(() => void refresh())}
              className={`rounded-full px-2 py-0.5 font-medium ${r.enabled ? 'bg-emerald-600/25 text-emerald-100' : 'bg-neutral-800 text-neutral-400'}`}
            >
              {r.enabled ? 'on' : 'off'}
            </button>
            <span className="text-neutral-200">{new Date(r.runAt).toLocaleString()}</span>
            <span className="truncate text-neutral-400" title={r.prompt}>{r.prompt}</span>
            <span className="flex-1" />
            <button onClick={() => void window.palette.routineRemove(r.id).then(() => void refresh())} className="text-neutral-500 hover:text-red-400">
              Remove
            </button>
          </div>
        ))}
      </div>
    </section>
  )
}

function ShortcutsPanel(): React.JSX.Element {
  const [hotkey, setHotkey] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  useEffect(() => {
    window.palette.getHotkey().then((h) => {
      const v = h as { hotkey: string; error: string | null }
      setHotkey(v.hotkey)
      if (v.error) setMsg(v.error)
    }).catch(() => {})
    window.palette.platformInfo().then((p) => {
      const v = p as { wayland: boolean; sessionType: string }
      if (v.wayland) setHint(`Wayland session (${v.sessionType}): global hotkeys are unreliable. Bind a system shortcut to palette --toggle if the hotkey fails.`)
    }).catch(() => {})
  }, [])
  return (
    <section className={cardCls}>
      <h3 className="text-sm font-semibold text-neutral-100">Shortcuts</h3>
      {hint && <p className="pt-1 text-xs text-amber-300">{hint}</p>}
      <div className="flex items-end gap-2 pt-3">
        <div className="flex-1">
          <Field label="Global hotkey">
            <input value={hotkey} onChange={(e) => setHotkey(e.target.value)} className={`${inputCls} font-mono text-xs`} />
          </Field>
        </div>
        <button
          onClick={() => void window.palette.setHotkey(hotkey).then((r) => setMsg((r as { ok: boolean; error: string | null }).ok ? 'Hotkey registered.' : ((r as { error: string | null }).error ?? 'Registration failed.')))}
          className="h-9 rounded-md bg-blue-500 px-4 text-sm font-medium text-white hover:bg-blue-400"
        >
          Save
        </button>
      </div>
      {msg && <p className="whitespace-pre-wrap pt-2 text-xs text-amber-200">{msg}</p>}
    </section>
  )
}

function UsagePanel(): React.JSX.Element {
  const [budget, setBudget] = useState<BudgetState | null>(null)
  useEffect(() => {
    window.palette.getBudget().then((v) => setBudget(v as BudgetState)).catch(() => {})
  }, [])
  return (
    <section className={cardCls}>
      <h3 className="text-sm font-semibold text-neutral-100">Usage</h3>
      <p className="pt-1 text-xs leading-relaxed text-neutral-300">
        {budget ? (
          <>
            Used {budget.used} / {budget.budget} this period ({budget.periodKey}); scheduled share {budget.scheduledUsed} / {budget.scheduledBudget}.{' '}
            {budget.warning !== 'none' && <span className="text-amber-300">Warning: {budget.warning}.</span>} Source of truth:{' '}
            <a href="https://dashboard.composio.dev" target="_blank" rel="noreferrer" className="text-blue-400 underline">
              Composio dashboard usage page
            </a>
            .
          </>
        ) : (
          'Loading…'
        )}
      </p>
    </section>
  )
}

/** shadcn-style settings dialog: sidebar + content, dark, search filter, Esc/backdrop close. */
export default function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }): React.JSX.Element | null {
  const [tab, setTab] = useState<SettingsTabId>('general')
  const [query, setQuery] = useState('')
  const items = useMemo(() => filterSettingsNav(query), [query])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setTab('general')
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  const titles: Record<SettingsTabId, string> = {
    general: 'General',
    model: 'Model',
    connections: 'Connections',
    routines: 'Routines',
    shortcuts: 'Shortcuts',
    usage: 'Usage'
  }

  return (
    <div role="dialog" aria-modal="true" aria-label="Settings" className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 p-3" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="flex max-h-[560px] w-full max-w-[680px] overflow-hidden rounded-xl border border-neutral-700 bg-neutral-950 shadow-2xl">
        <aside className="flex w-48 shrink-0 flex-col border-r border-neutral-800 bg-neutral-950 p-3">
          <h2 className="px-1 pb-2 text-sm font-semibold text-neutral-100">Settings</h2>
          <div className="relative">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-neutral-500">⌕</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              aria-label="Search settings"
              className="h-8 w-full rounded-md border border-neutral-700 bg-neutral-900 pl-7 pr-2 text-xs text-neutral-100 outline-none placeholder:text-neutral-500 focus:border-blue-500"
            />
          </div>
          <nav className="space-y-0.5 overflow-y-auto pt-2">
            {items.map((n) => (
              <button
                key={n.id}
                onClick={() => setTab(n.id)}
                className={`flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] ${tab === n.id ? 'bg-neutral-800 font-medium text-neutral-100' : 'text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200'}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${tab === n.id ? 'bg-blue-400' : 'bg-neutral-700'}`} />
                {n.label}
              </button>
            ))}
            {items.length === 0 && <p className="px-2 py-2 text-xs text-neutral-600">No matches.</p>}
          </nav>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-2.5">
            <span className="text-sm font-semibold text-neutral-100">{titles[tab]}</span>
            <button onClick={onClose} aria-label="Close settings" className="rounded-md px-2 py-0.5 text-neutral-400 hover:bg-neutral-800 hover:text-white">
              ✕
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto bg-neutral-950 p-4">
            {tab === 'general' && <GeneralPanel />}
            {tab === 'model' && <ModelPanel />}
            {tab === 'connections' && <ConnectionsPanel />}
            {tab === 'routines' && <RoutinesPanel />}
            {tab === 'shortcuts' && <ShortcutsPanel />}
            {tab === 'usage' && <UsagePanel />}
          </div>
        </div>
      </div>
    </div>
  )
}
