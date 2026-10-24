import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import type { ShellApi } from '../contracts/feature.js'
import type { ChatThread } from '../../shared/chat.js'
import type { AgentEvent } from '../../shared/agent.js'
import type { AppNotification } from '../../shared/contracts/notifications.js'
import { TITLEBAR_LEFT } from '../../shared/titlebar.js'
import { formatDateTime } from '../lib/format.js'
import { parseMentionedTools } from '../../shared/types.js'
import { ChatView } from './ChatView.js'
import { HomeView } from './HomeView.js'
import { ProfileMenu } from './ProfileMenu.js'
import { BreadcrumbBar, BreadcrumbProvider } from '../components/layout/Breadcrumbs.js'
import { createChatRunState, reduceChatRun, resolveChatApproval, type ChatRunState } from './chat-state.js'
import { getFeatureRegistry } from './registry.js'
import { FeatureContent } from './FeatureHost.js'
import type { AutomationTemplate } from '../../shared/contracts/automation-templates.js'
import { AUTOMATION_TABS, PRIMARY_NAV, ShellRouter, parseAutomationTab, splitNav } from './nav.js'
import SettingsApp from '../settings/SettingsDialog.js'
import { useI18n } from '../i18n/LanguageContext.js'
import type { UiKey } from '../i18n/strings.js'
import { SETTINGS_HEIGHT, SETTINGS_WIDTH } from '../../main/shell/settings-layout.js'
import './shell.css'

interface LocalProfile {
  name: string
  email: string
}

/** The title bar keeps clear of the macOS window controls. */
const TITLEBAR_VARS = { '--shell-titlebar-left': `${TITLEBAR_LEFT}px` } as React.CSSProperties

function Icon({ name }: { name: string }): React.JSX.Element {
  const paths: Record<string, React.ReactNode> = {
    // Top nav: Calendar / Routine trigger with 3 dots in the body (dyn-7789db6ae1e12c9089784fa0aa3df72d.png)
    automation: (
      <>
        <rect x="4" y="5" width="16" height="15" rx="3.5" strokeWidth="1.6" />
        <path d="M8 2.5v3.5M16 2.5v3.5" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M4 10h16" strokeWidth="1.3" />
        <circle cx="8.5" cy="14.5" r="0.8" fill="currentColor" stroke="none" />
        <circle cx="12" cy="14.5" r="0.8" fill="currentColor" stroke="none" />
        <circle cx="15.5" cy="14.5" r="0.8" fill="currentColor" stroke="none" />
      </>
    ),
    // Updates: Clean ECG / heartbeat waveform (dyn-7789db6ae1e12c9089784fa0aa3df72d.png)
    updates: (
      <>
        <path d="M4 12.5h3.8l2.2-5.5 3.5 11 2.5-5.5H20" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </>
    ),
    // Manage: 4 pill-rounded rounded squares (dyn-7789db6ae1e12c9089784fa0aa3df72d.png)
    manage: (
      <>
        <rect x="4.5" y="4.5" width="5.8" height="5.8" rx="2" strokeWidth="1.6" />
        <rect x="13.7" y="4.5" width="5.8" height="5.8" rx="2" strokeWidth="1.6" />
        <rect x="4.5" y="13.7" width="5.8" height="5.8" rx="2" strokeWidth="1.6" />
        <rect x="13.7" y="13.7" width="5.8" height="5.8" rx="2" strokeWidth="1.6" />
      </>
    ),
    // Canvas: Triangular branched node tree (dyn-7789db6ae1e12c9089784fa0aa3df72d.png)
    canvas: (
      <>
        <circle cx="12" cy="5.5" r="2.2" strokeWidth="1.6" />
        <circle cx="6" cy="18.5" r="2.2" strokeWidth="1.6" />
        <circle cx="18" cy="18.5" r="2.2" strokeWidth="1.6" />
        <path d="M10.8 7.3L7.2 16.5M13.2 7.3l3.6 9.2" strokeWidth="1.5" strokeLinecap="round" />
      </>
    ),
    // Bell: Smooth curved bell with small bottom clapper
    bell: (
      <>
        <path d="M18 8.5A6 6 0 0 0 6 8.5c0 6.5-2.8 7.8-2.8 8.5h17.6c0-.7-2.8-2-2.8-8.5" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M10.2 20.5a1.8 1.8 0 0 0 3.6 0" strokeWidth="1.6" strokeLinecap="round" />
      </>
    )
  }
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {paths[name] ?? <circle cx="12" cy="12" r="8" />}
    </svg>
  )
}

function displayName(profile: LocalProfile, fallback: string): string {
  return profile.name.trim() || profile.email.trim() || fallback
}

function errorText(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}

export default function ShellApp(): React.JSX.Element {
  const { t } = useI18n()
  const router = useMemo(() => new ShellRouter(), [])
  const [route, setRoute] = useState(router.current)
  const [profile, setProfile] = useState<LocalProfile>({ name: '', email: '' })
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [settings, setSettings] = useState<{ tab?: string } | null>(null)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [dashboardError, setDashboardError] = useState('')
  const [threads, setThreads] = useState<ChatThread[]>([])
  const [chatError, setChatError] = useState('')
  const [chatLoading, setChatLoading] = useState(true)
  const [run, setRun] = useState<ChatRunState | null>(null)
  const [runThreadId, setRunThreadId] = useState('')
  const [busy, setBusy] = useState(false)
  const [approvalError, setApprovalError] = useState('')
  const busyRef = useRef(false)
  const startingRunRef = useRef(false)
  const pendingRunEventsRef = useRef<AgentEvent[]>([])
  const runIdRef = useRef('')
  const runThreadIdRef = useRef('')
  const handledDone = useRef(new Set<string>())
  const features = useMemo(() => getFeatureRegistry(), [])
  const activeFeature = features.find((feature) => feature.id === route.view)
  const activeChatId = route.view === 'chat' && typeof route.params['chatId'] === 'string'
    ? route.params['chatId']
    : ''
  const activeThread = threads.find((thread) => thread.id === activeChatId)
  const unreadCount = notifications.filter((notification) => !notification.read).length
  // Unread dot on the Updates tab while runs streamed since the last visit.
  const [updatesUnread, setUpdatesUnread] = useState(false)
  const routeRef = useRef(route)
  routeRef.current = route

  const refreshThreads = useCallback(async (): Promise<ChatThread[]> => {
    const result = await window.app.chatList()
    if (!result.ok) throw new Error(t('shell.chatLoadError'))
    setThreads(result.threads)
    return result.threads
  }, [t])

  const refreshNotifications = useCallback(async (): Promise<void> => {
    const response = await window.app.notificationsList()
    if (!response.ok || !response.notifications) {
      throw new Error(response.error || t('shell.notifLoadError'))
    }
    setNotifications(response.notifications)
  }, [t])

  useEffect(() => {
    let active = true
    void window.app.getProfile().then((next) => {
      if (active) setProfile({ name: next.name, email: next.email })
    }).catch((error: unknown) => {
      console.error('Could not load local profile.', error)
    })
    void refreshThreads().catch((error: unknown) => {
      if (active) setChatError(errorText(error))
    }).finally(() => {
      if (active) setChatLoading(false)
    })
    void refreshNotifications().catch((error: unknown) => {
      if (active) setDashboardError(errorText(error))
    })
    return () => { active = false }
  }, [refreshThreads, refreshNotifications])

  useEffect(() => window.app.onNotificationsChanged(() => {
    void refreshNotifications().catch((error: unknown) => setDashboardError(errorText(error)))
  }), [refreshNotifications])

  useEffect(() => {
    const SEEN_KEY = 'palette:updates-since'
    // Only the stream matters: on any new run, flip the dot unless the user
    // is on Updates right now (then we just re-baseline).
    const viewingUpdates = (): boolean =>
      routeRef.current.view === 'automations' && routeRef.current.params['automationTab'] === 'updates'
    const off = window.app.onUpdatesChanged(() => {
      if (viewingUpdates()) {
        window.localStorage.setItem(SEEN_KEY, String(Date.now()))
        setUpdatesUnread(false)
        return
      }
      setUpdatesUnread(true)
    })
    return () => {
      off?.()
    }
  }, [])

  useEffect(() => {
    if (route.view === 'automations' && route.params['automationTab'] === 'updates') {
      window.localStorage.setItem('palette:updates-since', String(Date.now()))
      setUpdatesUnread(false)
    }
  }, [route.view, route.params['automationTab']])

  useEffect(() => {
    const onNotification = (event: Event): void => {
      const notification = (event as CustomEvent<Omit<AppNotification, 'id' | 'createdAt' | 'read'>>).detail
      void window.app.notificationCreate(notification).then(async (response) => {
        if (!response.ok) throw new Error(response.error || 'Could not save notification.')
        await refreshNotifications()
      }).catch((error: unknown) => setDashboardError(errorText(error)))
    }
    window.addEventListener('app:notification', onNotification)
    return () => window.removeEventListener('app:notification', onNotification)
  }, [refreshNotifications])

  useEffect(() => {
    const offOpen = window.app.onOpenSettings((tab) => setSettings({ tab }))
    const offClose = window.app.onSettingsClose(() => setSettings(null))
    return () => {
      offOpen()
      offClose()
    }
  }, [])

  useEffect(() => {
    if (!profileMenuOpen && !notificationsOpen) return
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as HTMLElement | null
      if (!target) return
      if (target.closest('.shell-profile-menu, .shell-profile-button, .shell-notifications-panel, .shell-notifications-button')) {
        return
      }
      setProfileMenuOpen(false)
      setNotificationsOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      setProfileMenuOpen(false)
      setNotificationsOpen(false)
    }
    window.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [profileMenuOpen, notificationsOpen])

  const navigate = useCallback((view: string, params: Record<string, unknown> = {}): void => {
    const apply = () => flushSync(() => {
      router.navigate(view, params)
      setChatError('')
      setNotificationsOpen(false)
      setProfileMenuOpen(false)
    })
    // Router updates state synchronously via its subscribe(setRoute), so
    // flushSync commits the new DOM inside the transition snapshot.
    if (document.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.startViewTransition(apply)
    } else {
      apply()
    }
  }, [router])

  useEffect(() => {
    const unsubscribe = router.subscribe(setRoute)
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!event.metaKey && !event.ctrlKey) return
      if (event.key.toLowerCase() === 'n') {
        event.preventDefault()
        navigate('home')
      } else if (event.key === ',') {
        event.preventDefault()
        window.app.openSettingsWindow()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      unsubscribe()
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [router, navigate])

  const handleAgentEvent = useCallback((event: AgentEvent): void => {
    if (!runIdRef.current) {
      if (startingRunRef.current) pendingRunEventsRef.current.push(event)
      return
    }
    if (event.runId !== runIdRef.current) return
    setRun((current) => current ? reduceChatRun(current, event) : current)
    if (event.type === 'done') {
      setBusy(false)
      busyRef.current = false
      const threadId = runThreadIdRef.current
      if (threadId && !handledDone.current.has(event.runId)) {
        handledDone.current.add(event.runId)
        if (event.text) {
          void window.app.chatAppend(threadId, {
            role: 'assistant',
            text: event.text,
            createdAt: Date.now()
          }).then(async (result) => {
            if (!result.ok) throw new Error(result.error || 'Could not save the assistant response.')
            await refreshThreads()
          }).catch((error: unknown) => {
            setChatError(`The response could not be saved: ${errorText(error)}`)
          })
        }
      }
    } else if (event.type === 'error' || event.type === 'aborted') {
      setBusy(false)
      busyRef.current = false
    }
  }, [refreshThreads])

  useEffect(() => window.app.onAgentEvent(handleAgentEvent), [handleAgentEvent])

  const shellApi = useMemo<ShellApi>(() => ({
    navigate,
    openCalendarWindow: () => {},
    openSettings: (tab) => window.app.openSettingsWindow(tab),
    notify: (notification) => window.dispatchEvent(new CustomEvent('app:notification', { detail: notification })),
    updatesList: (request) => window.app.updatesList(request),
    updatesStream: () => window.app.updatesStream(),
    onUpdatesChanged: (cb) => window.app.onUpdatesChanged(cb),
    getRunLog: (runId) => window.app.getRunLog(runId)
  }), [navigate])
  const initials = displayName(profile, t('shell.defaultProfile')).split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')

  async function sendMessage(text: string): Promise<boolean> {
    if (busyRef.current) return false
    busyRef.current = true
    setBusy(true)
    setChatError('')
    startingRunRef.current = true
    pendingRunEventsRef.current = []
    runIdRef.current = ''
    let threadId = activeChatId
    try {
      if (!threadId) {
        const created = await window.app.chatCreate()
        if (!created.ok || !created.thread) throw new Error(created.error || 'Could not create a chat.')
        threadId = created.thread.id
        setThreads((current) => [created.thread!, ...current].slice(0, 200))
        router.navigate('chat', { chatId: threadId })
      }
      const result = await window.app.agentRun({
        prompt: text,
        tools: parseMentionedTools(text),
        source: 'chat',
        chatId: threadId
      })
      if (!result.ok || !result.runId) throw new Error(result.error || 'Could not start the assistant.')
      runIdRef.current = result.runId
      runThreadIdRef.current = threadId
      setRunThreadId(threadId)
      setRun(createChatRunState(result.runId))
      await refreshThreads()
      startingRunRef.current = false
      const pending = pendingRunEventsRef.current
      pendingRunEventsRef.current = []
      for (const event of pending) handleAgentEvent(event)
      return true
    } catch (error) {
      startingRunRef.current = false
      pendingRunEventsRef.current = []
      busyRef.current = false
      setBusy(false)
      throw error
    }
  }

  async function decideApproval(approvalId: string, approved: boolean): Promise<void> {
    if (!runIdRef.current) return
    setApprovalError('')
    try {
      const result = await window.app.agentApproval({ runId: runIdRef.current, approvalId, approved })
      if (!result.ok) throw new Error(result.error || 'Could not submit approval.')
      setRun((current) => current ? resolveChatApproval(current, approvalId, approved) : current)
    } catch (error) {
      setApprovalError(errorText(error))
    }
  }

  async function stopRun(): Promise<void> {
    if (!runIdRef.current) return
    try {
      const result = await window.app.agentCancel(runIdRef.current)
      if (!result.ok) throw new Error(result.error || 'Could not stop the run.')
    } catch (error) {
      setChatError(`Could not stop the run: ${errorText(error)}`)
    }
  }

  async function readNotification(notification: AppNotification): Promise<void> {
    if (!notification.read) {
      const response = await window.app.notificationRead(notification.id)
      if (!response.ok) {
        setDashboardError(response.error || 'Could not mark notification as read.')
        return
      }
      setNotifications((current) => current.map((item) => item.id === notification.id ? { ...item, read: true } : item))
    }
    if (notification.link) navigate(notification.link.view, notification.link.params)
  }

  async function readAllNotifications(): Promise<void> {
    const response = await window.app.notificationsReadAll()
    if (!response.ok) {
      setDashboardError(response.error || 'Could not mark notifications as read.')
      return
    }
    setNotifications((current) => current.map((item) => ({ ...item, read: true })))
  }

  async function dismissNotification(id: string): Promise<void> {
    const response = await window.app.notificationDismiss(id)
    if (!response.ok) {
      setDashboardError(response.error || 'Could not dismiss notification.')
      return
    }
    setNotifications((current) => current.filter((item) => item.id !== id))
  }

  const automationTab = parseAutomationTab(route.params['automationTab']) ?? 'manage'
  const isCanvasView = route.view === 'automations' && automationTab === 'canvas'

  // Top bar nav. The pill splits around the active entry, which turns orange
  // in place (see .shell-topnav in shell.css). The Updates row carries an
  // unread dot while runs streamed since the last visit.
  const navItems = [
    ...PRIMARY_NAV.map((item) => ({
      id: item.id,
      label: t(`shell.${item.id === 'home' ? 'automate' : item.id}` as UiKey),
      icon: 'automation',
      active: route.view === item.view,
      run: () => navigate(item.view)
    })),
    ...AUTOMATION_TABS.map((tab) => ({
      id: tab.id,
      label: t(`shell.${tab.id}` as UiKey),
      icon: tab.icon,
      active: route.view === 'automations' && automationTab === tab.id,
      run: () => navigate('automations', { automationTab: tab.id })
    }))
  ]
  const activeNav = navItems.find((item) => item.active) ?? navItems[0]
  // The pill splits either side of the active view, which keeps its own slot.
  const { before: beforeActive, after: afterActive } = splitNav(navItems, activeNav.id)

  function renderItem(item: typeof navItems[number]): React.JSX.Element {
    const active = item.id === activeNav.id
    const unread = item.id === 'updates' && updatesUnread
    return (
      <button
        key={item.id}
        type="button"
        className={`shell-topnav-item${active ? ' is-active' : ''}`}
        style={{ viewTransitionName: `nav-${item.id}` }}
        aria-current={active ? 'page' : undefined}
        title={item.label}
        aria-label={item.label}
        onClick={item.run}
      >
        <Icon name={item.icon} />
        <span>{item.label}</span>
        {unread && <span className="shell-nav-dot" aria-hidden="true" />}
      </button>
    )
  }

  return (
    <BreadcrumbProvider>
      <main className="shell-frame" style={TITLEBAR_VARS}>
        <header className="shell-drag-strip" aria-label={t('shell.windowBar')}>
          <BreadcrumbBar />
          <nav className="shell-topnav" aria-label={t('shell.mainNav')}>
            {beforeActive.length > 0 && <div className="shell-topnav-group">{beforeActive.map(renderItem)}</div>}
            {renderItem(activeNav)}
            {afterActive.length > 0 && <div className="shell-topnav-group">{afterActive.map(renderItem)}</div>}
          </nav>
          <div className="shell-topbar-actions">
            <button
              type="button"
              className="shell-icon-button shell-notifications-button"
              aria-label={`${t('shell.notifications')}${unreadCount ? ` (${unreadCount} ${t('shell.unread')})` : ''}`}
              aria-expanded={notificationsOpen}
              title={t('shell.notifications')}
              onClick={() => setNotificationsOpen((open) => !open)}
            >
              <Icon name="bell" />
              {unreadCount > 0 && <span className="shell-notification-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
            </button>
            <button
              type="button"
              className="shell-profile-button"
              aria-label={`${t('shell.accountMenuFor')} ${displayName(profile, t('shell.defaultProfile'))}`}
              aria-expanded={profileMenuOpen}
              aria-haspopup="menu"
              title={t('shell.profile')}
              onClick={() => {
                setProfileMenuOpen((open) => !open)
                setNotificationsOpen(false)
              }}
            >
              <span className="shell-avatar">{initials || 'L'}</span>
            </button>
            <ProfileMenu
              open={profileMenuOpen}
              name={displayName(profile, t('shell.defaultProfile'))}
              email={profile.email.trim()}
              initials={initials}
              onClose={() => setProfileMenuOpen(false)}
              onOpenSettings={(tab) => window.app.openSettingsWindow(tab)}
            />
            {notificationsOpen && (
              <section className="shell-notifications-panel" aria-label={t('shell.notifications')}>
                <header>
                  <strong>{t('shell.notifications')}</strong>
                  {unreadCount > 0 && <button type="button" onClick={() => void readAllNotifications()}>{t('shell.markAllRead')}</button>}
                </header>
                {notifications.length ? (
                  <div className="shell-notifications-list">
                    {notifications.map((notification) => (
                      <article key={notification.id} className={`shell-notification${notification.read ? '' : ' is-unread'}`}>
                        <button type="button" className="shell-notification-body" onClick={() => void readNotification(notification)}>
                          <span>{notification.title}</span>
                          {notification.body && <small>{notification.body}</small>}
                          <time>{formatDateTime(notification.createdAt)}</time>
                        </button>
                        <button type="button" className="shell-notification-dismiss" aria-label={`${t('shell.dismiss')} ${notification.title}`} onClick={() => void dismissNotification(notification.id)}>×</button>
                      </article>
                    ))}
                  </div>
                ) : <p className="shell-notifications-empty">{t('shell.emptyNotifs')}</p>}
              </section>
            )}
          </div>
        </header>
        <div className="shell-workspace">
          <section className="shell-main-pane">
            {(chatError || dashboardError) && (
              <div className="shell-chat-error" role="alert">
                {chatError || dashboardError}
                <button type="button" onClick={() => { setChatError(''); setDashboardError('') }}>{t('shell.dismiss')}</button>
              </div>
            )}
            <div
              className={`shell-content${route.view === 'chat' ? ' has-chat-view' : ''}${!activeFeature && !activeChatId ? ' is-home' : ''}${activeFeature ? ' has-feature' : ''}${isCanvasView ? ' is-canvas-view' : ''}`}
              style={{ viewTransitionName: 'shell-content' }}
            >
              {activeFeature ? (
                <FeatureContent feature={activeFeature} shell={shellApi} params={route.params} />
              ) : activeChatId ? (
                activeThread ? (
                  <>
                    {approvalError && <p className="chat-inline-error" role="alert">{approvalError}</p>}
                    <ChatView
                      messages={activeThread.messages}
                      run={runThreadId === activeChatId ? run : null}
                      busy={busy}
                      onSend={sendMessage}
                      onApprove={(approvalId, approved) => void decideApproval(approvalId, approved)}
                      onStop={() => void stopRun()}
                      onOpenSettings={() => window.app.openSettingsWindow('agents')}
                      onOpenConnections={() => window.app.openSettingsWindow('connectors')}
                      onOpenAutomations={() => navigate('automations')}
                      onSelectTemplate={(template: AutomationTemplate) => navigate('home', { templateId: template.id })}
                    />
                  </>
                ) : (
                  <p className="shell-empty-state">{chatLoading ? t('shell.loadingChats') : t('shell.chatGone')}</p>
                )
              ) : (
                <HomeView shell={shellApi} params={route.params} />
              )}
            </div>
          </section>
        </div>
        {settings !== null && (
          <div
            className="shell-settings-overlay"
            onClick={(event) => {
              if (event.target === event.currentTarget) window.app.closeSettings()
            }}
          >
            <div className="shell-settings-card" style={{ width: SETTINGS_WIDTH, height: SETTINGS_HEIGHT }}>
              <SettingsApp key={settings.tab ?? 'general'} initialTab={settings.tab} />
            </div>
          </div>
        )}
      </main>
    </BreadcrumbProvider>
  )
}
