import { useEffect, useMemo, useRef, useState } from 'react'
import { ShaderBackdrop } from '../components/ShaderBackdrop.js'
import { Card, CardSub, CardTitle } from '../components/ui/card.js'
import { Input, Textarea } from '../components/ui/input.js'
import { Switch } from '../components/ui/switch.js'
import { filterSettingsNav, groupedSettingsNav, isSettingsTabRegistered, SETTINGS_NAV, type SettingsTabId } from './nav.js'
import { EXTRA_TABS } from './extra-tabs.js'
import { APP_THEMES, applyTheme, isAppTheme, type AppThemeValue } from './theme.js'
import { SUPPORTED_LANGUAGES } from './languages.js'
import { APP_SHORTCUTS } from './shortcuts.js'
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

function AccountPanel(): React.JSX.Element {
  const [profile, setProfile] = useState<Profile>({ name: '', email: '', about: '', language: 'system' })
  const [status, setStatus] = useState('Loading…')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const first = useRef(true)

  useEffect(() => {
    let live = true
    window.app
      .getProfile()
      .then((r) => {
        const res = r as unknown as Partial<Profile>
        first.current = false
        if (live && typeof res.name === 'string') {
          setProfile({ name: res.name ?? '', email: res.email ?? '', about: res.about ?? '', language: res.language ?? 'system' })
          setStatus('Saved as you go.')
        }
      })
      .catch(() => {
        first.current = false
        if (live) setStatus('Could not load profile.')
      })
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

  return (
    <div className="set-stack">
      <div className="settings-page-intro">
        <h2>Account</h2>
        <p>Manage the profile details and context shared with the assistant.</p>
      </div>
      <Card>
        <CardTitle>Profile</CardTitle>
        <CardSub>Your name and shared context for the assistant. Changes save automatically. {status}</CardSub>
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
    </div>
  )
}

function GeneralPanel(): React.JSX.Element {
  const [stayOn, setStayOn] = useState(true)
  const [behaviorStatus, setBehaviorStatus] = useState('')

  useEffect(() => {
    let live = true
    window.app.getAppBehavior()
      .then((result) => {
        const behavior = result as unknown as { ok: boolean; keepBackground?: boolean }
        if (live && behavior.ok && typeof behavior.keepBackground === 'boolean') setStayOn(behavior.keepBackground)
      })
      .catch(() => {
        if (live) setBehaviorStatus('Could not load app preferences.')
      })
    return () => { live = false }
  }, [])

  function toggleStayOn(next: boolean): void {
    const previous = stayOn
    setStayOn(next)
    window.app
      .setAppBehavior({ keepBackground: next })
      .then((r) => {
        const res = r as unknown as { ok: boolean; error?: string }
        if (!res.ok) setStayOn(previous)
        setBehaviorStatus(res.ok ? 'Saved.' : (res.error ?? 'Save failed.'))
      })
      .catch(() => {
        setStayOn(previous)
        setBehaviorStatus('Save failed.')
      })
  }

  return (
    <div className="set-stack">
      <div className="settings-page-intro">
        <h2>General</h2>
        <p>Set app-wide preferences and what happens when you close the window.</p>
      </div>
      <section className="set-split">
        <div className="set-split-text">
          <h3>Stay on in background</h3>
          <p>
            Keep the app, tray and scheduled routines running in the background.
            Turn off to quit the app when its window closes.
            {behaviorStatus ? ` ${behaviorStatus}` : ''}
          </p>
        </div>
        <Switch checked={stayOn} label="Stay on in background" onCheckedChange={toggleStayOn} />
      </section>
      <section className="set-shortcuts">
        <div className="set-split-text">
          <h3>Keyboard shortcuts</h3>
          <p>Open, close, and move around the app without touching the mouse.</p>
        </div>
        <ul className="set-shortcut-list">
          {APP_SHORTCUTS.map((shortcut) => (
            <li key={shortcut.id} className="set-shortcut-row">
              <div className="set-split-text">
                <h4>{shortcut.action}</h4>
                <p>{shortcut.description}</p>
              </div>
              <span className="set-kbd-group">
                {shortcut.keys.map((key) => (
                  <kbd key={key} className="set-kbd">{key}</kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function AppearancePanel({
  shader,
  onShader,
  theme,
  onTheme
}: {
  shader: boolean
  onShader: (next: boolean) => void
  theme: AppThemeValue
  onTheme: (next: AppThemeValue) => void
}): React.JSX.Element {
  const [status, setStatus] = useState('')
  const [language, setLanguage] = useState('system')
  const [languageStatus, setLanguageStatus] = useState('')
  const [themeStatus, setThemeStatus] = useState('')

  useEffect(() => {
    let live = true
    window.app.getProfile()
      .then((result) => {
        const profile = result as unknown as Partial<Profile>
        if (live && typeof profile.language === 'string') setLanguage(profile.language)
      })
      .catch(() => {
        if (live) setLanguageStatus('Could not load language preference.')
      })
    return () => { live = false }
  }, [])

  async function saveLanguage(next: string): Promise<void> {
    const previous = language
    setLanguage(next)
    setLanguageStatus('Saving…')
    try {
      const result = await window.app.getProfile()
      const profile = result as unknown as Partial<Profile>
      const saved = await window.app.setProfile({
          name: profile.name ?? '',
          email: profile.email ?? '',
          about: profile.about ?? '',
          language: next
        })
      const response = saved as { ok: boolean; error?: string }
      if (!response.ok) setLanguage(previous)
      setLanguageStatus(response.ok ? 'Saved.' : (response.error ?? 'Save failed.'))
    } catch {
      setLanguage(previous)
      setLanguageStatus('Save failed.')
    }
  }

  function saveTheme(next: AppThemeValue): void {
    const previous = theme
    onTheme(next)
    applyTheme(next)
    setThemeStatus('Saving…')
    window.app
      .setAppBehavior({ theme: next })
      .then((r) => {
        const res = r as unknown as { ok: boolean; error?: string }
        if (!res.ok) {
          onTheme(previous)
          applyTheme(previous)
        }
        setThemeStatus(res.ok ? 'Saved.' : (res.error ?? 'Save failed.'))
      })
      .catch(() => {
        onTheme(previous)
        applyTheme(previous)
        setThemeStatus('Save failed.')
      })
  }

  return (
    <div className="set-stack">
      <div className="settings-page-intro">
        <h2>Appearance</h2>
        <p>Pick day or night mode, choose a language, and tune the background.</p>
      </div>
      <section className="set-split">
        <div className="set-split-text">
          <h3>Mode</h3>
          <p>
            Day is a bright light theme, night is the dim dark theme.
            System follows your OS setting.
            {themeStatus ? ` ${themeStatus}` : ''}
          </p>
        </div>
        <div className="set-theme-group" role="radiogroup" aria-label="Color mode">
          {APP_THEMES.map((entry) => (
            <button
              key={entry.value}
              type="button"
              role="radio"
              aria-checked={theme === entry.value}
              title={entry.hint}
              className={`set-theme-option${theme === entry.value ? ' is-active' : ''}`}
              onClick={() => { if (theme !== entry.value && isAppTheme(entry.value)) saveTheme(entry.value) }}
            >
              {entry.label}
            </button>
          ))}
        </div>
      </section>
      <section className="set-split">
        <div className="set-split-text">
          <h3>Language</h3>
          <p>
            The app follows your system language unless you pick one here. Only part of the interface is translated
            so far — untranslated text stays in English.
          </p>
          {languageStatus && <span className="set-save-status">{languageStatus}</span>}
        </div>
        <select
          value={language}
          onChange={(e) => void saveLanguage(e.target.value)}
          aria-label="Language"
          className="set-select-native"
        >
          {SUPPORTED_LANGUAGES.map((entry) => (
            <option key={entry.value} value={entry.value}>
              {entry.label}{entry.hint && entry.value !== 'system' ? ` (${entry.hint})` : ''}
            </option>
          ))}
        </select>
      </section>
      <Card className="appearance-card">
        <div className={`appearance-preview${shader ? '' : ' is-static'}`} aria-hidden>
          <ShaderBackdrop enabled={shader} />
          <span>{shader ? 'Animated color wash' : 'Static background'}</span>
        </div>
        <div className="appearance-setting">
          <div>
            <CardTitle>Animated background</CardTitle>
            <CardSub>Slow-moving color behind the app. Turn it off for a flat look and lower GPU use on battery.</CardSub>
            {status && <p className="set-save-status">{status}</p>}
          </div>
          <Switch
            checked={shader}
            label="Animated background"
            onCheckedChange={(next) => {
              const previous = shader
              onShader(next)
              setStatus('Saving…')
              window.app
                .setAppBehavior({ shader: next })
                .then((r) => {
                  const res = r as unknown as { ok: boolean; error?: string }
                  if (!res.ok) onShader(previous)
                  setStatus(res.ok ? 'Saved.' : (res.error ?? 'Save failed.'))
                })
                .catch(() => {
                  onShader(previous)
                  setStatus('Save failed.')
                })
            }}
          />
        </div>
      </Card>
    </div>
  )
}

function UsagePanel(): React.JSX.Element {
  const [budget, setBudget] = useState<BudgetState | null>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    window.app.getBudget()
      .then((value) => setBudget(value as BudgetState))
      .catch(() => setError('Could not load usage data.'))
  }, [])
  return (
    <div className="set-stack">
      <div className="settings-page-intro">
        <h2>Usage</h2>
        <p>See how much of your Composio request budget has been used this period.</p>
      </div>
      {budget ? (
        <>
          <Card className="usage-card">
            <div className="usage-summary">
              <div>
                <p className="usage-eyebrow">Requests used</p>
                <p className="usage-number">{budget.used.toLocaleString()}<span> / {budget.budget.toLocaleString()}</span></p>
              </div>
              <span className="usage-period">{budget.periodKey}</span>
            </div>
            <div
              className="usage-track"
              role="progressbar"
              aria-label="Overall request budget used"
              aria-valuemin={0}
              aria-valuemax={budget.budget}
              aria-valuenow={Math.min(budget.used, budget.budget)}
            >
              <span style={{ width: `${budget.budget > 0 ? Math.min(100, (budget.used / budget.budget) * 100) : 0}%` }} />
            </div>
            <div className="usage-breakdown">
              <div>
                <span className="usage-dot usage-dot-total" />
                <span>All requests</span>
                <strong>{budget.used.toLocaleString()} / {budget.budget.toLocaleString()}</strong>
              </div>
              <div>
                <span className="usage-dot usage-dot-scheduled" />
                <span>Scheduled runs</span>
                <strong>{budget.scheduledUsed.toLocaleString()} / {budget.scheduledBudget.toLocaleString()}</strong>
                <div
                  className="usage-inline-track"
                  role="progressbar"
                  aria-label="Scheduled request budget used"
                  aria-valuemin={0}
                  aria-valuemax={budget.scheduledBudget}
                  aria-valuenow={Math.min(budget.scheduledUsed, budget.scheduledBudget)}
                >
                  <span style={{ width: `${budget.scheduledBudget > 0 ? Math.min(100, (budget.scheduledUsed / budget.scheduledBudget) * 100) : 0}%` }} />
                </div>
              </div>
            </div>
            {budget.warning !== 'none' && <p className="set-warn usage-warning">Budget warning: {budget.warning}.</p>}
          </Card>
          <p className="usage-footnote">
            Usage is tracked for this period.{' '}
            <a href="https://dashboard.composio.dev" target="_blank" rel="noreferrer" className="set-link">
              View Composio dashboard
            </a>
          </p>
        </>
      ) : <Card><p className="set-body-text">{error || 'Loading usage…'}</p></Card>}
    </div>
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
  const [theme, setTheme] = useState<AppThemeValue>('system')
  const items = useMemo(() => filterSettingsNav(query), [query])
  const groups = useMemo(() => groupedSettingsNav(items), [items])
  const ExtraTab = EXTRA_TABS[tab]

  useEffect(() => {
    window.app
      .getAppBehavior()
      .then((r) => {
        const res = r as unknown as { ok: boolean; shader?: boolean; theme?: unknown }
        if (res.ok && typeof res.shader === 'boolean') setShader(res.shader)
        if (res.ok && isAppTheme(res.theme)) setTheme(res.theme)
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

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

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
            {tab === 'account' && <AccountPanel />}
            {tab === 'appearance' && <AppearancePanel shader={shader} onShader={setShader} theme={theme} onTheme={setTheme} />}
            {tab === 'connectors' && <ConnectorsTab />}
            {tab === 'usage' && <UsagePanel />}
            {ExtraTab && <ExtraTab />}
          </div>
        </div>
      </div>
    </div>
  )
}
