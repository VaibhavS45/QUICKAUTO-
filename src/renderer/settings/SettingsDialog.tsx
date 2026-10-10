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
import './settings.css'

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

function Field({ label, children }: { label: string; children: React.ReactNode }): React.JSX.Element {
  return (
    <label className="set-field">
      <span className="set-field-label">{label}</span>
      {children}
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

  function toggleBackground(next: boolean): void {
    setKeepBackground(next)
    window.app
      .setAppBehavior({ keepBackground: next })
      .then((r) => {
        const res = r as unknown as { ok: boolean; error?: string }
        setBehaviorStatus(res.ok ? 'Saved.' : (res.error ?? 'Save failed.'))
      })
      .catch(() => setBehaviorStatus('Save failed.'))
  }

  return (
    <div className="set-stack">
      <Card>
        <CardTitle>Profile</CardTitle>
        <CardSub>Your details and shared context. {status}</CardSub>
        <div className="set-list">
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
            <span className="set-field-label">
              About me{' '}
              <span title="Shared with the agent as background context." className="set-help">
                ?
              </span>
            </span>
            <Textarea
              value={profile.about}
              onChange={(e) => patch({ about: e.target.value })}
              rows={5}
              aria-label="About me"
            />
          </div>
        </div>
      </Card>
      <section className="set-split">
        <div className="set-split-text">
          <h3>Language</h3>
          <p>
            The app follows your system language unless you pick one here. Only part of the interface is translated
            so far — untranslated text stays in English.
          </p>
        </div>
        <select
          value={profile.language}
          onChange={(e) => patch({ language: e.target.value })}
          aria-label="Language"
          className="set-select-native"
        >
          <option value="system">System</option>
          <option value="en">English</option>
        </select>
      </section>
      <section className="set-split">
        <div className="set-split-text">
          <h3>When the app window is closed</h3>
          <p>
            Keep the app, tray and scheduled routines running in the background.
            Turn off to quit the app when its window closes.
            {behaviorStatus ? ` ${behaviorStatus}` : ''}
          </p>
        </div>
        <Switch checked={keepBackground} label="Keep app in background" onCheckedChange={toggleBackground} />
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
    <section className="set-split">
      <div className="set-split-text">
        <h3>Animated background</h3>
        <p>
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
    <div className="set-stack">
      <Card>
        <CardTitle>Model</CardTitle>
        <CardSub>Provider, model, and encrypted API key.</CardSub>
        <div className="set-list">
          <div className="set-grid2">
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
            <Field label="Base URL">
              <Input monospace value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="http://localhost:11434/v1" />
            </Field>
          )}
          <div className="set-row">
            <div className="set-grow">
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
              <input value={resetDay} onChange={(e) => setResetDay(e.target.value)} inputMode="numeric" className="set-reset" />
            </Field>
            <Button onClick={() => void save()}>
              Save
            </Button>
          </div>
        </div>
        {msg && <p className="set-msg">{msg}</p>}
        <Hint>Keys are encrypted with the OS keychain (safeStorage) and never leave the main process.</Hint>
      </Card>
      <Card>
        <CardTitle>Auto-approve</CardTitle>
        <label className="set-check">
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
      <div className="set-list">
        <div className="set-row">
          <div className="set-grow">
            <Field label="Composio project key">
              <Input monospace type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder={state?.configured ? '•••••• (enter to replace)' : 'ak_…'} />
            </Field>
          </div>
          <Button onClick={() => void save()}>
            Save
          </Button>
        </div>
      </div>
      {msg && <p className="set-msg">{msg}</p>}
      {state && (
        <div className="set-badges">
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
    <div>
      <h4 className="set-subhead">GitHub (local CLI, read-only)</h4>
      <div className="set-status-line">
        <span>
          {gh ? (gh.ok ? (gh.detail ?? 'gh status unknown') : (gh.error ?? 'gh check failed')) : 'Checking gh…'}
        </span>
        <Button variant="secondary" size="sm" onClick={() => void refresh()}>
          Refresh
        </Button>
      </div>
      {gh?.ok && !gh.authenticated && (
        <p className="set-fix">Fix: run `gh auth login` in a terminal, then press Refresh.</p>
      )}
      <Hint>Only these repos are accessible to @github. Each path must exist and be a git repo whose origin matches owner/name.</Hint>
      <div className="set-list">
        {repos.length === 0 && <p className="set-list-empty">No repos yet.</p>}
        {repos.map((r) => (
          <div key={r.repo.toLowerCase()} className="set-list-item">
            <span className="mono">{r.repo}</span>
            <span className="dim" title={r.path}>{r.path}</span>
            {r.testCommand && <span className="dim" title={r.testCommand}>tests: {r.testCommand}</span>}
            <span className="spacer" />
            <button onClick={() => remove(r.repo)} className="set-link-danger">
              Remove
            </button>
          </div>
        ))}
      </div>
      <div className="set-row">
        <div className="set-grow">
          <Field label="Local path">
            <Input monospace value={newPath} onChange={(e) => setNewPath(e.target.value)} placeholder="/home/you/code/repo" />
          </Field>
        </div>
        <Field label="owner/name">
          <Input monospace value={newRepo} onChange={(e) => setNewRepo(e.target.value)} placeholder="owner/name" />
        </Field>
        <div className="set-grow">
          <Field label="Test command (optional)">
            <Input monospace value={newTestCommand} onChange={(e) => setNewTestCommand(e.target.value)} placeholder="npm test" />
          </Field>
        </div>
        <Button onClick={add}>
          Add
        </Button>
      </div>
      {msg && <p className="set-msg">{msg}</p>}
    </div>
  )
}

function GmailConnectBlock(): React.JSX.Element {
  const g = useGmailConnect()
  return (
    <div>
      <div className="set-status-line">
        <span>
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
      {g.status?.detail && <p className="set-detail">{g.status.detail}</p>}
      {g.message && <p className="set-msg">{g.message}</p>}
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
      <div className="set-list">
        {items.length === 0 && <p className="set-list-empty">No routines yet.</p>}
        {items.map((r) => (
          <div key={r.id} className="set-list-item">
            <button
              onClick={() => void window.app.routineToggle(r.id, !r.enabled).then(() => void refresh())}
              className={`set-toggle${r.enabled ? ' is-on' : ''}`}
            >
              {r.enabled ? 'on' : 'off'}
            </button>
            <span className="set-date">{new Date(r.runAt).toLocaleString()}</span>
            <span className="set-prompt" title={r.prompt}>{r.prompt}</span>
            <span className="spacer" />
            <button onClick={() => void window.app.routineRemove(r.id).then(() => void refresh())} className="set-link-danger">
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
      <p className="set-body-text">
        {budget ? (
          <>
            Used {budget.used} / {budget.budget} this period ({budget.periodKey}); scheduled share {budget.scheduledUsed} / {budget.scheduledBudget}.{' '}
            {budget.warning !== 'none' && <span className="set-warn">Warning: {budget.warning}.</span>} Source of truth:{' '}
            <a href="https://dashboard.composio.dev" target="_blank" rel="noreferrer" className="set-link">
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
  if (id === 'general') {
    return (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden>
        <circle cx="8" cy="6" r="2.2" stroke="currentColor" strokeWidth="1.3" />
        <path d="M3.5 13c.8-2.2 2.4-3.3 4.5-3.3S11.7 10.8 12.5 13" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    )
  }
  if (id === 'appearance') {
    return (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden>
        <circle cx="8" cy="8" r="5" stroke="currentColor" strokeWidth="1.3" />
        <path d="M8 3v10A5 5 0 0 0 8 3Z" fill="currentColor" />
      </svg>
    )
  }
  if (id === 'provider') {
    return (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M4 11.5 8 3.5l4 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5.5 8.5h5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    )
  }
  if (id === 'connectors') {
    return (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden>
        <path d="M6.2 9.8 4.4 11.6a2 2 0 1 1-2.8-2.8l1.8-1.8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        <path d="M9.8 6.2 11.6 4.4a2 2 0 1 1 2.8 2.8L12.6 9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        <path d="M6.5 9.5l3-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    )
  }
  if (id === 'routines') {
    return (
      <svg viewBox="0 0 16 16" fill="none" aria-hidden>
        <rect x="2.5" y="3.5" width="11" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3" />
        <path d="M2.5 6.5h11M6 2.5v2M10 2.5v2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3 12.5 6.2 6.5 8 10l1.6-2.8L13 12.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Floating settings window: grouped sidebar + content, shadcn components on the app theme. */
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
    <div className="settings" role="dialog" aria-label="Settings">
      <aside className="settings-sidebar">
        <ShaderBackdrop enabled={shader} />
        <div className="settings-dragover" />
        <div className="settings-side-head">
          <h2>Settings</h2>
          <div className="settings-search">
            <span className="settings-search-icon">⌕</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              aria-label="Search settings"
            />
          </div>
        </div>
        <nav className="settings-nav">
          {groups.map((g) => (
            <div key={g.id}>
              <div className="settings-nav-group-label">
                {g.label}
              </div>
              <div className="settings-nav-group">
                {g.items.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => setTab(n.id)}
                    className={`settings-nav-item${tab === n.id ? ' is-active' : ''}`}
                  >
                    <NavGlyph id={n.id} />
                    {n.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {items.length === 0 && <p className="settings-nav-empty">No matches.</p>}
        </nav>
      </aside>
      <div className="settings-main">
        <div className="settings-header">
          <span className="settings-header-title">
            {TAB_TITLES[tab] ?? SETTINGS_NAV.find((item) => item.id === tab)?.label ?? 'Settings'}
          </span>
          <button
            onClick={() => window.app.closeSettings()}
            aria-label="Close settings"
            className="settings-close"
          >
            ✕
          </button>
        </div>
        <div className="settings-body">
          <div className="settings-body-inner">
            {tab === 'general' && <GeneralPanel />}
            {tab === 'appearance' && <AppearancePanel shader={shader} onShader={setShader} />}
            {tab === 'provider' && <ModelPanel />}
            {tab === 'connectors' && <ConnectionsPanel />}
            {tab === 'routines' && <RoutinesPanel />}
            {tab === 'usage' && <UsagePanel />}
            {ExtraTab && <ExtraTab />}
          </div>
        </div>
      </div>
    </div>
  )
}
