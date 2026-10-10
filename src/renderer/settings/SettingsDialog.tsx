import { useEffect, useMemo, useRef, useState } from 'react'
import { ShaderBackdrop } from '../components/ShaderBackdrop.js'
import { Card, CardSub, CardTitle } from '../components/ui/card.js'
import { Input, Textarea } from '../components/ui/input.js'
import { Switch } from '../components/ui/switch.js'
import { filterSettingsNav, groupedSettingsNav, isSettingsTabRegistered, SETTINGS_NAV, type SettingsTabId } from './nav.js'
import { EXTRA_TABS } from './extra-tabs.js'
import ConnectorsTab from './tabs/ConnectorsTab.js'
import './settings.css'

export { SETTINGS_NAV, filterSettingsNav, groupedSettingsNav } from './nav.js'
export type { SettingsNavItem, SettingsTabId } from './nav.js'

interface Profile {
  name: string
  email: string
  about: string
  language: string
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
  agents: 'Agents',
  connectors: 'Connectors',
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
  if (id === 'agents') {
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
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M3 12.5 6.2 6.5 8 10l1.6-2.8L13 12.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Floating settings panel: grouped sidebar + content, shadcn components on the app theme. */
export default function SettingsApp({ initialTab }: { initialTab?: string }): React.JSX.Element {
  const [tab, setTab] = useState<SettingsTabId>(() => {
    if (initialTab && isSettingsTabRegistered(initialTab)) return initialTab
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
            {(tab === 'general' || tab === 'account') && <GeneralPanel />}
            {tab === 'appearance' && <AppearancePanel shader={shader} onShader={setShader} />}
            {tab === 'connectors' && <ConnectorsTab />}
            {tab === 'usage' && <UsagePanel />}
            {ExtraTab && <ExtraTab />}
          </div>
        </div>
      </div>
    </div>
  )
}
