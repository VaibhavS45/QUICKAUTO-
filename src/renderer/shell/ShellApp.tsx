import { useEffect, useMemo, useState } from 'react'
import type { FeatureProps, ShellApi } from '../contracts/feature.js'
import { getFeatureRegistry } from './registry.js'
import { createShellRouter } from './router.js'
import { SIDEBAR_NAV_ITEMS, SIDEBAR_SECTIONS } from './sidebar-model.js'
import './shell.css'

interface LocalProfile {
  name: string
  email: string
}

function Icon({ name }: { name: string }): React.JSX.Element {
  const paths: Record<string, React.ReactNode> = {
    plus: <path d="M12 5v14M5 12h14" />,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    puzzle: <path d="M5 3h4a2 2 0 1 1 4 0h6v6a2 2 0 1 0 0 4v8h-6a2 2 0 1 1-4 0H3v-6a2 2 0 1 0 0-4V3h2Z" />,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.7a8 8 0 0 1-1.5.9l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.5-.9l-1.7.7-1.4-2.4 1.4-1.1a8 8 0 0 1 0-1.8l-1.4-1.1 1.4-2.4 1.7.7a8 8 0 0 1 1.5-.9l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.5.9l1.7-.7 1.4 2.4-1.4 1.1a8 8 0 0 1 0 1.8Z" /></>,
    chevron: <path d="m9 18 6-6-6-6" />
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {paths[name] ?? <circle cx="12" cy="12" r="8" />}
    </svg>
  )
}

function displayName(profile: LocalProfile): string {
  return profile.name.trim() || profile.email.trim() || 'Local profile'
}

export default function ShellApp(): React.JSX.Element {
  const router = useMemo(() => createShellRouter(), [])
  const [route, setRoute] = useState(router.getRoute())
  const [collapsed, setCollapsed] = useState(false)
  const [profile, setProfile] = useState<LocalProfile>({ name: '', email: '' })
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const features = useMemo(() => getFeatureRegistry(), [])
  const activeFeature = features.find((feature) => feature.id === route.view)

  useEffect(() => {
    let active = true
    window.palette.getProfile().then((next) => {
      if (active) setProfile({ name: next.name, email: next.email })
    }).catch((error: unknown) => {
      console.error('Could not load local profile.', error)
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!event.metaKey && !event.ctrlKey) return
      if (event.key.toLowerCase() === 'n') {
        event.preventDefault()
        navigate('home')
      } else if (event.key.toLowerCase() === 'b') {
        event.preventDefault()
        setCollapsed((value) => !value)
      } else if (event.key === ',') {
        event.preventDefault()
        window.palette.openSettingsWindow()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [router])

  function navigate(view: string, params: Record<string, unknown> = {}): void {
    setRoute(router.navigate(view, params))
    setAccountMenuOpen(false)
  }

  const shellApi: ShellApi = {
    navigate,
    openCalendarWindow: () => window.palette.openCalendarWindow(),
    openSettings: (tab) => window.palette.openSettingsWindow(tab),
    notify: (notification) => window.dispatchEvent(new CustomEvent('palette:notification', { detail: notification }))
  }
  const title = activeFeature?.title ?? (route.view === 'plugins' ? 'Plugins' : 'New chat')
  const initials = displayName(profile).split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')

  return (
    <main className={`shell-frame${collapsed ? ' is-collapsed' : ''}`}>
      <header className="shell-drag-strip" aria-label="Window title bar">
        <span className="shell-brand">Palette</span>
      </header>
      <div className="shell-workspace">
        <aside className="shell-sidebar" aria-label="Main navigation">
          <nav className="shell-primary-nav">
            {SIDEBAR_NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`shell-nav-item${route.view === item.view ? ' is-active' : ''}`}
                aria-current={route.view === item.view ? 'page' : undefined}
                title={collapsed ? item.label : undefined}
                onClick={() => navigate(item.view)}
              >
                <Icon name={item.id === 'home' ? 'plus' : item.id === 'plugins' ? 'puzzle' : 'calendar'} />
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
          <div className="shell-sidebar-sections">
            {SIDEBAR_SECTIONS.map((section) => (
              <section className="shell-sidebar-section" key={section} aria-label={section}>
                <h2>{section}</h2>
              </section>
            ))}
          </div>
          <footer className="shell-sidebar-footer">
            <button
              type="button"
              className="shell-profile-button"
              aria-label={`Account menu for ${displayName(profile)}`}
              aria-expanded={accountMenuOpen}
              onClick={() => setAccountMenuOpen((open) => !open)}
            >
              <span className="shell-avatar">{initials || 'L'}</span>
              <span className="shell-profile-name">{displayName(profile)}</span>
              <Icon name="chevron" />
            </button>
            {accountMenuOpen && (
              <div className="shell-account-menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    window.palette.openSettingsWindow('account')
                    setAccountMenuOpen(false)
                  }}
                >
                  Account settings
                </button>
              </div>
            )}
            <div className="shell-footer-actions">
              <button type="button" className="shell-icon-button" aria-label="Notifications" title="Notifications">
                <Icon name="bell" />
              </button>
              <button
                type="button"
                className="shell-icon-button"
                aria-label="Settings"
                title="Settings (Ctrl/Cmd+,)"
                onClick={() => window.palette.openSettingsWindow()}
              >
                <Icon name="settings" />
              </button>
            </div>
          </footer>
        </aside>
        <section className="shell-main-pane">
          <header className="shell-pane-header">
            <h1>{title}</h1>
          </header>
          <div className="shell-content">
            {activeFeature ? (
              <activeFeature.Component shell={shellApi} initialTemplate={route.params['template'] as FeatureProps['initialTemplate']} />
            ) : route.view === 'plugins' ? (
              <p className="shell-empty-state">Plugins are coming soon.</p>
            ) : (
              <div className="shell-home">
                <div className="shell-home-mark"><Icon name="plus" /></div>
                <h2>What can I help with?</h2>
                <p>Start a conversation with your assistant.</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
