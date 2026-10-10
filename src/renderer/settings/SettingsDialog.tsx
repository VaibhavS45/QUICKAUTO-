import { useEffect, useMemo, useRef, useState } from 'react'
import { ShaderBackdrop } from '../components/ShaderBackdrop.js'
import { Badge } from '../components/ui/badge.js'
import { Button } from '../components/ui/button.js'
import { Card, CardSub, CardTitle, Hint } from '../components/ui/card.js'
import { Input, Select, Textarea } from '../components/ui/input.js'
import { Switch } from '../components/ui/switch.js'
import { useGmailConnect } from '../hooks/useGmailConnect.js'
import { filterSettingsNav, groupedSettingsNav, isSettingsTabRegistered, SETTINGS_NAV, type SettingsTabId } from './nav.js'
import { EXTRA_TABS } from './extra-tabs.js'

export { SETTINGS_NAV, filterSettingsNav, groupedSettingsNav } from './nav.js'
export type { SettingsNavItem, SettingsTabId } from './nav.js'

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
  githubRepos?: Array<{ path: string; repo: string; testCommand?: string }>
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

const labelCls = 'text-xs font-medium text-neutral-300'

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
  const [keepBackground, setKeepBackground] = useState(true)
  const [behaviorStatus, setBehaviorStatus] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const first = useRef(true)

  useEffect(() => {
    let live = true
    window.app
      .getProfile()
      .then((r) => {
        const res = r as unknown as Partial<Profile>
        if (live && typeof res.name === 'string') {
          setProfile({ name: res.name ?? '', email: res.email ?? '', about: res.about ?? '', language: res.language ?? 'system' })
          setStatus('Saved as you go.')
        }
      })
      .catch(() => live && setStatus('Could not load profile.'))
    window.app
      .getAppBehavior()
      .then((r) => {
        const res = r as unknown as { ok: boolean; keepBackground?: boolean }
        if (live && res.ok && typeof res.keepBackground === 'boolean') setKeepBackground(res.keepBackground)
      })
      .catch(() => {})
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
      window.app
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
      <Card>
        <CardTitle>Profile</CardTitle>
        <CardSub>Your details and shared context. {status}</CardSub>
        <div className="space-y-3 pt-3">
          <Input
            value={profile.name}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder="Your name"
            aria-label="Your name"
          />
          <Input
            value={profile.email}
            onChange={(e) => patch({ email: e.target.value })}
            placeholder="you@example.com"
            aria-label="Email"
            inputMode="email"
          />
          <div>
            <div className="flex items-center gap-1.5">
              <span className={labelCls}>About me</span>
              <span title="Shared with the agent as background context." className="cursor-help text-neutral-500">
                ?
              </span>
            </div>
            <Textarea
              value={profile.about}
              onChange={(e) => patch({ about: e.target.value })}
              rows={5}
              aria-label="About me"
              className="mt-1"
            />
          </div>
        </div>
      </Card>
      <section className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-neutral-100">Language</h3>
          <p className="max-w-md pt-1 text-xs leading-relaxed text-neutral-400">
            The app follows your system language unless you pick one here. Only part of the interface is translated
            so far — untranslated text stays in English.
          </p>
        </div>        <select
          value={profile.language}
          onChange={(e) => patch({ language: e.target.value })}
          aria-label="Language"
          className="h-9 shrink-0 rounded-md border border-neutral-700 bg-neutral-900 px-3 text-sm text-neutral-100 outline-none focus:border-blue-500"
        >
          <option value="system">System</option>
          <option value="en">English</option>
        </select>
      </section>
      <section className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold text-neutral-100">When the app window is closed</h3>
          <p className="max-w-md pt-1 text-xs leading-relaxed text-neutral-400">
            Keep the app, tray and scheduled routines running in the background.
            Turn off to quit the app when its window closes.
            {behaviorStatus ? ` ${behaviorStatus}` : ''}
          </p>
        </div>
        <button
          role="switch"
          aria-checked={keepBackground}
          aria-label="Keep app in background"
          onClick={() => {
            const next = !keepBackground
            setKeepBackground(next)
            window.app
              .setAppBehavior({ keepBackground: next })
              .then((r) => {
                const res = r as unknown as { ok: boolean; error?: string }
                setBehaviorStatus(res.ok ? 'Saved.' : (res.error ?? 'Save failed.'))
              })
              .catch(() => setBehaviorStatus('Save failed.'))
          }}
          className={`h-6 w-11 shrink-0 rounded-full p-0.5 transition-colors ${keepBackground ? 'bg-emerald-600' : 'bg-neutral-700'}`}
        >
          <span className={`block h-5 w-5 rounded-full bg-white transition-transform ${keepBackground ? 'translate-x-5' : ''}`} />
        </button>
      </section>
    </div>
  )
}

function AppearancePanel({
  shader,
  onShader
}: {
  shader: boolean
  onShader: (next: boolean) => void
}): React.JSX.Element {
  const [status, setStatus] = useState('')

  return (
    <section className="flex items-start justify-between gap-4">
      <div>
        <h3 className="text-sm font-semibold text-neutral-100">Animated background</h3>
        <p className="max-w-md pt-1 text-xs leading-relaxed text-neutral-400">
          Slow-moving colour wash behind the app interface. Turn off for a flat, static background and
          less GPU use on battery. {status}
        </p>
      </div>
      <Switch
        checked={shader}
        label="Animated background"
        onCheckedChange={(next) => {
          onShader(next)
          window.app
            .setAppBehavior({ shader: next })
            .then((r) => {
              const res = r as unknown as { ok: boolean; error?: string }
              setStatus(res.ok ? 'Saved.' : (res.error ?? 'Save failed.'))
            })
            .catch(() => setStatus('Save failed.'))
        }}
      />
    </section>
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
    window.app
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
    const current = (await window.app.getModelSettings()) as ModelState
    const res = (await window.app.setModelSettings({
      provider,
      model: model.trim(),
      baseUrl: baseUrl.trim() || undefined,
      resetDay: rd,
      githubRepos: current.githubRepos,
      autoApprove: autoApproveEcho ? ['echo'] : []
    })) as { ok: boolean; error?: string }
    if (!res.ok) {
      setMsg(res.error ?? 'Save failed.')
      return
    }
    if (apiKey.trim()) {
      const kr = (await window.app.setApiKey(apiKey.trim())) as { ok: boolean; error?: string }
      if (!kr.ok) {
        setMsg(kr.error ?? 'Key save failed.')
        return
      }
      setApiKey('')
    }
    setMsg('Saved.')
    setS((await window.app.getModelSettings()) as ModelState)
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardTitle>Model</CardTitle>
        <CardSub>Provider, model, and encrypted API key.</CardSub>
        <div className="grid grid-cols-2 gap-3 pt-3">
          <Field label="Provider">
            <Select value={provider} onChange={(e) => setProvider(e.target.value)}>
              <option value="anthropic">anthropic</option>
              <option value="openai">openai</option>
              <option value="openai-compatible">openai-compatible</option>
            </Select>
          </Field>
          <Field label="Model">
            <Input monospace value={model} onChange={(e) => setModel(e.target.value)} placeholder="claude-sonnet-4-5" />
          </Field>
        </div>
        {provider === 'openai-compatible' && (
          <div className="pt-3">
            <Field label="Base URL">
              <Input monospace value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="http://localhost:11434/v1" />
            </Field>
          </div>
        )}
        <div className="flex flex-wrap items-end gap-2 pt-3">
          <div className="min-w-52 flex-1">
            <Field label={`API key ${s?.keySet ? '(set ✓)' : '(not set)'}`}>
              <Input
                monospace
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={s?.keySet ? '•••••• (enter to replace)' : 'sk-…'}
              />
            </Field>
          </div>
          <Field label="Reset day">
            <input value={resetDay} onChange={(e) => setResetDay(e.target.value)} inputMode="numeric" className="h-9 w-16 rounded-md border border-neutral-700 bg-neutral-950 px-2 font-mono text-xs text-neutral-100 outline-none focus:border-blue-500" />
          </Field>
          <Button onClick={() => void save()}>
            Save
          </Button>
        </div>
        {msg && <p className="pt-2 text-xs text-amber-200">{msg}</p>}
        <Hint>Keys are encrypted with the OS keychain (safeStorage) and never leave the main process.</Hint>
      </Card>
      <Card>
        <CardTitle>Auto-approve</CardTitle>
        <label className="flex items-center gap-2 pt-2 text-xs text-neutral-300">
          <input
            type="checkbox"
            checked={autoApproveEcho}
            onChange={(e) => setAutoApproveEcho(e.target.checked)}
          />
          echo (harmless test tool) — runs without asking
        </label>
        <Hint>
          Default: everything asks. Writes (email draft/send/reply/labels) always need approval
          and can never auto-approve; scheduled runs never auto-approve anything.
        </Hint>
      </Card>
    </div>
  )
}

function ConnectionsPanel(): React.JSX.Element {
  const [state, setState] = useState<ConnectorState | null>(null)
  const [key, setKey] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => {
    window.app.getConnector().then((v) => setState(v as ConnectorState)).catch(() => {})
  }, [])
  async function save(): Promise<void> {
    setMsg(null)
    const res = (await window.app.setConnectorKey(key.trim())) as { ok: boolean; error?: string }
    if (!res.ok) {
      setMsg(res.error ?? 'Save failed.')
      return
    }
    setKey('')
    setMsg('Saved.')
    setState((await window.app.getConnector()) as ConnectorState)
  }
  return (
    <Card>
      <CardTitle>Connections</CardTitle>
      <CardSub>
        One Composio project key unlocks @notion, @gmail, @sheets, @websearch. Keys stay encrypted in the main process.
      </CardSub>
      <div className="flex flex-wrap items-end gap-2 pt-3">
        <div className="min-w-52 flex-1">
          <Field label="Composio project key">
            <Input monospace type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder={state?.configured ? '•••••• (enter to replace)' : 'ak_…'} />
          </Field>
        </div>
        <Button onClick={() => void save()}>
          Save
        </Button>
      </div>
      {msg && <p className="pt-2 text-xs text-amber-200">{msg}</p>}
      {state && (
        <div className="flex flex-wrap gap-1.5 pt-3">
          {state.services.map((sv) => (
            <Badge key={sv.id} pill title={sv.detail ?? ''} variant={sv.connected ? 'ok' : 'mute'}>
              @{sv.id} {sv.connected ? '✓' : '○'}
            </Badge>
          ))}
        </div>
      )}
      <GitHubPanel />
      <GmailConnectBlock />
    </Card>
  )
}

interface GhStatus {
  ok: boolean
  installed?: boolean
  authenticated?: boolean
  detail?: string
  error?: string
}

/**
 * @github settings: local `gh` CLI status + repo allowlist. Auth happens via
 * `gh auth login` in the user's terminal — the token is never read or stored.
 * Only allowlisted repos are accessible to the agent; entries are validated
 * (path exists, git repo, origin match) when saved.
 */
function GitHubPanel(): React.JSX.Element {
  const [gh, setGh] = useState<GhStatus | null>(null)
  const [repos, setRepos] = useState<Array<{ path: string; repo: string; testCommand?: string }>>([])
  const [newPath, setNewPath] = useState('')
  const [newRepo, setNewRepo] = useState('')
  const [newTestCommand, setNewTestCommand] = useState('')
  const [msg, setMsg] = useState<string | null>(null)

  async function refresh(): Promise<void> {
    try {
      setGh((await window.app.githubStatus()) as GhStatus)
    } catch {
      setGh({ ok: false, error: 'Could not check gh status.' })
    }
    try {
      const m = (await window.app.getModelSettings()) as ModelState
      setRepos(m.githubRepos ?? [])
    } catch {
      /* keep current list */
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  async function save(next: Array<{ path: string; repo: string; testCommand?: string }>): Promise<void> {
    setMsg(null)
    try {
      const m = (await window.app.getModelSettings()) as ModelState
      const res = (await window.app.setModelSettings({
        provider: m.provider,
        model: m.model,
        baseUrl: m.baseUrl,
        resetDay: m.resetDay,
        githubRepos: next,
        autoApprove: m.autoApprove
      })) as { ok: boolean; error?: string }
      if (!res.ok) {
        setMsg(res.error ?? 'Save failed.')
        return
      }
      setRepos(next)
      setMsg('Saved.')
    } catch {
      setMsg('Save failed.')
    }
  }

  function add(): void {
    const path = newPath.trim()
    const repo = newRepo.trim()
    if (!path || !repo) {
      setMsg('Enter both a local path and owner/name.')
      return
    }
    if (repos.some((r) => r.repo.toLowerCase() === repo.toLowerCase())) {
      setMsg(`"${repo}" is already in the list.`)
      return
    }
    setNewPath('')
    setNewRepo('')
    const testCommand = newTestCommand.trim()
    setNewTestCommand('')
    void save([...repos, { path, repo, ...(testCommand ? { testCommand } : {}) }])
  }

  function remove(repo: string): void {
    void save(repos.filter((r) => r.repo.toLowerCase() !== repo.toLowerCase()))
  }

  return (
    <div className="pt-4">
      <h4 className="text-sm font-semibold text-neutral-100">GitHub (local CLI, read-only)</h4>
      <div className="flex flex-wrap items-center gap-2 pt-2 text-xs">
        <span className="text-neutral-400">
          {gh ? (gh.ok ? (gh.detail ?? 'gh status unknown') : (gh.error ?? 'gh check failed')) : 'Checking gh…'}
        </span>
        <Button variant="secondary" size="sm" onClick={() => void refresh()}>
          Refresh
        </Button>
      </div>
      {gh?.ok && !gh.authenticated && (
        <p className="pt-1 font-mono text-[11px] text-amber-300">Fix: run `gh auth login` in a terminal, then press Refresh.</p>
      )}
      <Hint>Only these repos are accessible to @github. Each path must exist and be a git repo whose origin matches owner/name.</Hint>
      <div className="space-y-1.5 pt-2">
        {repos.length === 0 && <p className="text-xs text-neutral-500">No repos yet.</p>}
        {repos.map((r) => (
          <div key={r.repo.toLowerCase()} className="flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-950 px-2.5 py-2 text-xs">
            <span className="font-mono text-neutral-200">{r.repo}</span>
            <span className="truncate font-mono text-neutral-500" title={r.path}>{r.path}</span>
            {r.testCommand && <span className="truncate font-mono text-neutral-500" title={r.testCommand}>tests: {r.testCommand}</span>}
            <span className="flex-1" />
            <button onClick={() => remove(r.repo)} className="text-neutral-500 hover:text-red-400">
              Remove
            </button>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-2 pt-2">
        <div className="min-w-40 flex-1">
          <Field label="Local path">
            <Input monospace value={newPath} onChange={(e) => setNewPath(e.target.value)} placeholder="/home/you/code/repo" />
          </Field>
        </div>
        <div className="w-44">
          <Field label="owner/name">
            <Input monospace value={newRepo} onChange={(e) => setNewRepo(e.target.value)} placeholder="owner/name" />
          </Field>
        </div>
        <div className="min-w-40 flex-1">
          <Field label="Test command (optional)">
            <Input monospace value={newTestCommand} onChange={(e) => setNewTestCommand(e.target.value)} placeholder="npm test" />
          </Field>
        </div>
        <Button onClick={add}>
          Add
        </Button>
      </div>
      {msg && <p className="pt-2 text-xs text-amber-200">{msg}</p>}
    </div>
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
          <Button variant="success" size="sm" onClick={() => void g.connect()} disabled={g.connecting}>
            {g.connecting ? 'Waiting…' : 'Connect Gmail'}
          </Button>
        )}
        <Button variant="secondary" size="sm" onClick={() => void g.refresh()}>
          Refresh
        </Button>
      </div>
      {g.status?.detail && <p className="pt-1 text-[11px] text-neutral-500">{g.status.detail}</p>}
      {g.message && <p className="pt-1 text-xs text-amber-200">{g.message}</p>}
    </div>
  )
}

function RoutinesPanel(): React.JSX.Element {
  const [items, setItems] = useState<RoutineItem[]>([])
  useEffect(() => {
    window.app.routineList().then((r) => {
      const res = r as { ok: boolean; routines: RoutineItem[] }
      if (res.ok) setItems(res.routines)
    }).catch(() => {})
  }, [])
  async function refresh(): Promise<void> {
    const res = (await window.app.routineList()) as { ok: boolean; routines: RoutineItem[] }
    if (res.ok) setItems(res.routines)
  }
  return (
    <Card>
      <CardTitle>Routines ({items.length})</CardTitle>
      <CardSub>
        Scheduled agent runs appear here and can be enabled, paused, or removed.
      </CardSub>
      <div className="space-y-1.5 pt-3">
        {items.length === 0 && <p className="text-xs text-neutral-500">No routines yet.</p>}
        {items.map((r) => (
          <div key={r.id} className="flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-950 px-2.5 py-2 text-xs">
            <button
              onClick={() => void window.app.routineToggle(r.id, !r.enabled).then(() => void refresh())}
              className={`rounded-full px-2 py-0.5 font-medium ${r.enabled ? 'bg-emerald-600/25 text-emerald-100' : 'bg-neutral-800 text-neutral-400'}`}
            >
              {r.enabled ? 'on' : 'off'}
            </button>
            <span className="text-neutral-200">{new Date(r.runAt).toLocaleString()}</span>
            <span className="truncate text-neutral-400" title={r.prompt}>{r.prompt}</span>
            <span className="flex-1" />
            <button onClick={() => void window.app.routineRemove(r.id).then(() => void refresh())} className="text-neutral-500 hover:text-red-400">
              Remove
            </button>
          </div>
        ))}
      </div>
    </Card>
  )
}

function UsagePanel(): React.JSX.Element {
  const [budget, setBudget] = useState<BudgetState | null>(null)
  useEffect(() => {
    window.app.getBudget().then((v) => setBudget(v as BudgetState)).catch(() => {})
  }, [])
  return (
    <Card>
      <CardTitle>Usage</CardTitle>
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
    </Card>
  )
}

const TAB_TITLES: Record<string, string> = {
  general: 'General',
  appearance: 'Appearance',
  provider: 'Provider',
  connectors: 'Connectors',
  routines: 'Routines',
  usage: 'Usage'
}

function NavGlyph({ id }: { id: SettingsTabId }): React.JSX.Element {
  const common = 'h-4 w-4 shrink-0'
  if (id === 'general') {
    return (
      <svg className={common} viewBox="0 0 16 16" fill="none" aria-hidden>
        <circle cx="8" cy="6" r="2.2" stroke="currentColor" strokeWidth="1.3" />
        <path d="M3.5 13c.8-2.2 2.4-3.3 4.5-3.3S11.7 10.8 12.5 13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    )
  }
  if (id === 'appearance') {
    return (
      <svg className={common} viewBox="0 0 16 16" fill="none" aria-hidden>
        <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.3" />
        <path d="M8 3v10A5 5 0 0 0 8 3Z" fill="currentColor" />
      </svg>
    )
  }
  if (id === 'provider') {
    return (
      <svg className={common} viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M4 11.5 8 3.5l4 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5.5 8.5h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    )
  }
  if (id === 'connectors') {
    return (
      <svg className={common} viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M6.2 9.8 4.4 11.6a2 2 0 1 1-2.8-2.8l1.8-1.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        <path d="M9.8 6.2 11.6 4.4a2 2 0 1 1 2.8 2.8L12.6 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        <path d="M6.5 9.5l3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    )
  }
  if (id === 'routines') {
    return (
      <svg className={common} viewBox="0 0 16 16" fill="none" aria-hidden>
        <rect x="2.5" y="3.5" width="11" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
        <path d="M2.5 6.5h11M6 2.5v2M10 2.5v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg className={common} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3 12.5 6.2 6.5 8 10l1.6-2.8L13 12.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Full-window settings: Cursor-like grouped sidebar + content. */
export default function SettingsApp(): React.JSX.Element {
  const [tab, setTab] = useState<SettingsTabId>(() => {
    const value = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('tab')
    return value && isSettingsTabRegistered(value) ? value : 'general'
  })
  const [query, setQuery] = useState('')
  const [shader, setShader] = useState(true)
  const items = useMemo(() => filterSettingsNav(query), [query])
  const groups = useMemo(() => groupedSettingsNav(items), [items])
  const ExtraTab = EXTRA_TABS[tab]

  useEffect(() => {
    window.app
      .getAppBehavior()
      .then((r) => {
        const res = r as unknown as { ok: boolean; shader?: boolean }
        if (res.ok && typeof res.shader === 'boolean') setShader(res.shader)
      })
      .catch(() => {})
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') window.app.closeSettings()
    }
    const removeSettingsListener = window.app.onOpenSettings((next) => {
      if (next && isSettingsTabRegistered(next)) setTab(next)
    })
    window.addEventListener('keydown', onKey)
    return () => {
      removeSettingsListener()
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  return (
    <div className="relative flex h-screen bg-[#0c0c0e] text-neutral-200" role="dialog" aria-label="Settings">
      <aside className="relative flex w-[240px] shrink-0 flex-col border-r border-white/5 bg-[#141414]">
        <ShaderBackdrop enabled={shader} />
        <div className="window-titlebar relative z-10 shrink-0 h-11" />
        <div className="relative z-10 px-3 pb-2">
          <h2 className="px-1 pb-2 text-[13px] font-semibold text-neutral-100">Settings</h2>
          <div className="relative">
            <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-neutral-500">⌕</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              aria-label="Search settings"
              className="h-8 w-full rounded-md border border-white/8 bg-black/30 pl-7 pr-2 text-xs text-neutral-100 outline-none placeholder:text-neutral-500 focus:border-white/20"
            />
          </div>
        </div>
        <nav className="relative z-10 min-h-0 flex-1 space-y-3 overflow-y-auto px-2 pb-3">
          {groups.map((g) => (
            <div key={g.id}>
              <div className="px-2 pb-1 text-[10px] font-medium uppercase tracking-[0.14em] text-neutral-500">
                {g.label}
              </div>
              <div className="space-y-0.5">
                {g.items.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => setTab(n.id)}
                    className={`flex w-full items-center gap-2 rounded-md px-2 py-[6px] text-left text-[13px] ${
                      tab === n.id
                        ? 'bg-white/8 font-medium text-neutral-50'
                        : 'text-neutral-400 hover:bg-white/5 hover:text-neutral-200'
                    }`}
                  >
                    <NavGlyph id={n.id} />
                    {n.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {items.length === 0 && <p className="px-2 py-2 text-xs text-neutral-600">No matches.</p>}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col bg-[#0c0c0e]">
        <div className="window-titlebar flex h-11 shrink-0 items-center justify-between border-b border-white/5 px-5">
          <span className="text-[13px] font-medium text-neutral-200">
            {TAB_TITLES[tab] ?? SETTINGS_NAV.find((item) => item.id === tab)?.label ?? 'Settings'}
          </span>
          <button
            onClick={() => window.app.closeSettings()}
            aria-label="Close settings"
            className="rounded-md px-2 py-0.5 text-neutral-500 hover:bg-white/8 hover:text-white"
          >
            ✕
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          {(tab === 'general' || tab === 'account') && <GeneralPanel />}
          {tab === 'appearance' && <AppearancePanel shader={shader} onShader={setShader} />}
          {tab === 'provider' && <ModelPanel />}
          {tab === 'connectors' && <ConnectionsPanel />}
          {tab === 'routines' && <RoutinesPanel />}
          {tab === 'usage' && <UsagePanel />}
          {ExtraTab && <ExtraTab />}
        </div>
      </div>
    </div>
  )
}
