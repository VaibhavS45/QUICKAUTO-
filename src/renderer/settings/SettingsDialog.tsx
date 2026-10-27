import { useEffect, useMemo, useRef, useState } from 'react'
import { Bot, ChartColumn, CircleQuestionMark, CircleUserRound, Palette, Plug, Search, Server, Settings2, SlidersHorizontal, X, type LucideIcon } from 'lucide-react'
import { ShaderBackdrop } from '../components/ShaderBackdrop.js'
import { Card, CardSub, CardTitle } from '../components/ui/card.js'
import { Input, Textarea } from '../components/ui/input.js'
import { Switch } from '../components/ui/switch.js'
import { filterSettingsNav, groupedSettingsNav, isSettingsTabRegistered, SETTINGS_NAV, type SettingsTabId } from './nav.js'
import { EXTRA_TABS } from './extra-tabs.js'
import { APP_THEMES, applyTheme, isAppTheme, THEME_LABEL_KEYS, type AppThemeValue } from './theme.js'
import { SUPPORTED_LANGUAGES } from './languages.js'
import { APP_SHORTCUTS } from './shortcuts.js'
import { useI18n } from '../i18n/LanguageContext.js'
import type { UiKey } from '../i18n/strings.js'
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
  const { t } = useI18n()
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
        <h2>{t('account.heading')}</h2>
        <p>{t('account.intro')}</p>
      </div>
      <Card>
        <CardTitle>{t('account.profileTitle')}</CardTitle>
        <CardSub>{t('account.profileSub')}{status}</CardSub>
        <div className="set-list">
          <Input
            value={profile.name}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder={t('account.namePlaceholder')}
            aria-label={t('account.namePlaceholder')}
          />
          <Input
            value={profile.email}
            onChange={(e) => patch({ email: e.target.value })}
            placeholder={t('account.emailPlaceholder')}
            aria-label="Email"
            inputMode="email"
          />
          <div>
            <span className="set-field-label">
              {t('account.aboutLabel')}{' '}
              <span title="Shared with the agent as background context." className="set-help">
                <CircleQuestionMark aria-hidden />
              </span>
            </span>
            <Textarea
              value={profile.about}
              onChange={(e) => patch({ about: e.target.value })}
              rows={5}
              aria-label={t('account.aboutLabel')}
            />
          </div>
        </div>
      </Card>
    </div>
  )
}

function GeneralPanel(): React.JSX.Element {
  const { t } = useI18n()
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
        if (live) setBehaviorStatus(t('common.failed'))
      })
    return () => { live = false }
  }, [t])

  function toggleStayOn(next: boolean): void {
    const previous = stayOn
    setStayOn(next)
    window.app
      .setAppBehavior({ keepBackground: next })
      .then((r) => {
        const res = r as unknown as { ok: boolean; error?: string }
        if (!res.ok) setStayOn(previous)
        setBehaviorStatus(res.ok ? t('common.saved') : (res.error ?? t('common.failed')))
      })
      .catch(() => {
        setStayOn(previous)
        setBehaviorStatus(t('common.failed'))
      })
  }

  return (
    <div className="set-stack">
      <div className="settings-page-intro">
        <h2>{t('general.heading')}</h2>
        <p>{t('general.intro')}</p>
      </div>
      <section className="set-split">
        <div className="set-split-text">
          <h3>{t('general.stayTitle')}</h3>
          <p>
            {t('general.stayBody')}
            {behaviorStatus ? ` ${behaviorStatus}` : ''}
          </p>
        </div>
        <Switch checked={stayOn} label={t('general.stayTitle')} onCheckedChange={toggleStayOn} />
      </section>
      <section className="set-shortcuts">
        <div className="set-split-text">
          <h3>{t('general.shortcutsTitle')}</h3>
          <p>{t('general.shortcutsBody')}</p>
        </div>
        <ul className="set-shortcut-list">
          {APP_SHORTCUTS.map((shortcut) => (
            <li key={shortcut.id} className="set-shortcut-row">
              <div className="set-split-text">
                <h4>{t(`${shortcut.textId}.action` as UiKey)}</h4>
                <p>{t(`${shortcut.textId}.desc` as UiKey)}</p>
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
  const { t, preference, setPreference } = useI18n()
  const [status, setStatus] = useState('')
  const [languageStatus, setLanguageStatus] = useState('')
  const [themeStatus, setThemeStatus] = useState('')

  async function saveLanguage(next: string): Promise<void> {
    setLanguageStatus(t('common.saving'))
    const result = await setPreference(next)
    // The select reads from context, so it reverts on its own on failure.
    setLanguageStatus(result.ok ? t('common.saved') : (result.error ?? t('common.failed')))
  }

  function saveTheme(next: AppThemeValue): void {
    const previous = theme
    onTheme(next)
    applyTheme(next)
    setThemeStatus(t('common.saving'))
    window.app
      .setAppBehavior({ theme: next })
      .then((r) => {
        const res = r as unknown as { ok: boolean; error?: string }
        if (!res.ok) {
          onTheme(previous)
          applyTheme(previous)
        }
        setThemeStatus(res.ok ? t('common.saved') : (res.error ?? t('common.failed')))
      })
      .catch(() => {
        onTheme(previous)
        applyTheme(previous)
        setThemeStatus(t('common.failed'))
      })
  }

  return (
    <div className="set-stack">
      <div className="settings-page-intro">
        <h2>{t('appearance.heading')}</h2>
        <p>{t('appearance.intro')}</p>
      </div>
      <section className="set-split">
        <div className="set-split-text">
          <h3>{t('appearance.modeTitle')}</h3>
          <p>
            {t('appearance.modeBody')}
            {themeStatus ? ` ${themeStatus}` : ''}
          </p>
        </div>
        <div className="set-theme-group" role="radiogroup" aria-label={t('appearance.modeTitle')}>
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
              {t(THEME_LABEL_KEYS[entry.value] as UiKey)}
            </button>
          ))}
        </div>
      </section>
      <section className="set-split">
        <div className="set-split-text">
          <h3>{t('appearance.languageTitle')}</h3>
          <p>{t('appearance.languageBody')}</p>
          {languageStatus && <span className="set-save-status">{languageStatus}</span>}
        </div>
        <select
          value={preference}
          onChange={(e) => void saveLanguage(e.target.value)}
          aria-label={t('appearance.languageTitle')}
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
          <span>{shader ? t('appearance.wash') : t('appearance.static')}</span>
        </div>
        <div className="appearance-setting">
          <div>
            <CardTitle>{t('appearance.animatedTitle')}</CardTitle>
            <CardSub>{t('appearance.animatedBody')}</CardSub>
            {status && <p className="set-save-status">{status}</p>}
          </div>
          <Switch
            checked={shader}
            label={t('appearance.animatedTitle')}
            onCheckedChange={(next) => {
              const previous = shader
              onShader(next)
              setStatus(t('common.saving'))
              window.app
                .setAppBehavior({ shader: next })
                .then((r) => {
                  const res = r as unknown as { ok: boolean; error?: string }
                  if (!res.ok) onShader(previous)
                  setStatus(res.ok ? t('common.saved') : (res.error ?? t('common.failed')))
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

const TAB_TITLES: Record<string, UiKey> = {
  general: 'settings.tab.general',
  appearance: 'settings.tab.appearance',
  agents: 'settings.tab.agents',
  connectors: 'settings.tab.connectors',
  usage: 'settings.tab.usage'
}

const NAV_ICONS: Record<string, LucideIcon> = {
  general: SlidersHorizontal,
  appearance: Palette,
  account: CircleUserRound,
  agents: Bot,
  connectors: Plug,
  usage: ChartColumn,
  mcp: Server
}

function NavGlyph({ id }: { id: SettingsTabId }): React.JSX.Element {
  const Icon = NAV_ICONS[id] ?? Settings2
  return <Icon aria-hidden />
}

/** Floating settings panel: grouped sidebar + content, shadcn components on the app theme. */
export default function SettingsApp({ initialTab }: { initialTab?: string }): React.JSX.Element {
  const { t } = useI18n()
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
    <div className="settings" role="dialog" aria-label={t('settings.title')}>
      <aside className="settings-sidebar">
        <ShaderBackdrop enabled={shader} />
        <div className="settings-dragover" />
        <div className="settings-side-head">
          <div className="settings-search">
            <Search className="settings-search-icon" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('settings.searchPlaceholder')}
              aria-label={t('settings.searchPlaceholder')}
            />
          </div>
        </div>
        <nav className="settings-nav">
          {groups.map((g) => (
            <div key={g.id}>
              <div className="settings-nav-group-label">
                {t(`settings.group.${g.id}` as UiKey)}
              </div>
              <div className="settings-nav-group">
                {g.items.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => setTab(n.id)}
                    className={`settings-nav-item${tab === n.id ? ' is-active' : ''}`}
                  >
                    <NavGlyph id={n.id} />
                    {t(`settings.tab.${n.id}` as UiKey) === `settings.tab.${n.id}` ? n.label : t(`settings.tab.${n.id}` as UiKey)}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {items.length === 0 && <p className="settings-nav-empty">{t('settings.noMatches')}</p>}
        </nav>
      </aside>
      <div className="settings-main">
        <div className="settings-header">
          <span className="settings-header-title">
            {TAB_TITLES[tab] ? t(TAB_TITLES[tab]) : (SETTINGS_NAV.find((item) => item.id === tab)?.label ?? t('settings.title'))}
          </span>
          <button
            onClick={() => window.app.closeSettings()}
            aria-label={t('settings.close')}
            className="settings-close"
          >
            <X aria-hidden />
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
