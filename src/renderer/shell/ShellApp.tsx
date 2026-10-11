import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ShellApi } from '../contracts/feature.js'
import type { ChatThread } from '../../shared/chat.js'
import type { AgentEvent } from '../../shared/agent.js'
import type { AppNotification } from '../../shared/contracts/notifications.js'
import { parseMentionedTools } from '../../shared/types.js'
import { ChatView } from './ChatView.js'
import { CommandPalette, type PaletteItem } from './CommandPalette.js'
import { HomeView } from './HomeView.js'
import { ProfileMenu } from './ProfileMenu.js'
import { createChatRunState, reduceChatRun, resolveChatApproval, type ChatRunState } from './chat-state.js'
import { getFeatureRegistry } from './registry.js'
import { FeatureContent } from './FeatureHost.js'
import type { AutomationTemplate } from '../../shared/contracts/automation-templates.js'
import { AUTOMATION_TABS, PRIMARY_NAV, ShellRouter, parseAutomationTab } from './nav.js'
import SettingsApp from '../settings/SettingsDialog.js'
import { SETTINGS_HEIGHT, SETTINGS_WIDTH } from '../../main/shell/settings-layout.js'
import './shell.css'

interface LocalProfile {
  name: string
  email: string
}

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

function displayName(profile: LocalProfile): string {
  return profile.name.trim() || profile.email.trim() || 'Local profile'
}

function errorText(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}

export default function ShellApp(): React.JSX.Element {
  const router = useMemo(() => new ShellRouter(), [])
  const [route, setRoute] = useState(router.current)
  const [profile, setProfile] = useState<LocalProfile>({ name: '', email: '' })
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [settings, setSettings] = useState<{ tab?: string } | null>(null)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [dashboardError, setDashboardError] = useState('')
  const [threads, setThreads] = useState<ChatThread[]>([])
  const [paletteOpen, setPaletteOpen] = useState(false)
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

  const refreshThreads = useCallback(async (): Promise<ChatThread[]> => {
    const result = await window.app.chatList()
    if (!result.ok) throw new Error('Could not load chat history.')
    setThreads(result.threads)
    return result.threads
  }, [])

  const refreshNotifications = useCallback(async (): Promise<void> => {
    const response = await window.app.notificationsList()
    if (!response.ok || !response.notifications) {
      throw new Error(response.error || 'Could not load notifications.')
    }
    setNotifications(response.notifications)
  }, [])

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
    const unsubscribe = router.subscribe(setRoute)
    const onKeyDown = (event: KeyboardEvent): void => {
      if (!event.metaKey && !event.ctrlKey) return
      if (event.key.toLowerCase() === 'n') {
        event.preventDefault()
        navigate('home')
      } else if (event.key === ',') {
        event.preventDefault()
        window.app.openSettingsWindow()
      } else if (event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen((open) => !open)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      unsubscribe()
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [router])

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

  function navigate(view: string, params: Record<string, unknown> = {}): void {
    router.navigate(view, params)
    setChatError('')
    setNotificationsOpen(false)
    setProfileMenuOpen(false)
  }

  const shellApi: ShellApi = {
    navigate,
    openCalendarWindow: () => {},
    openSettings: (tab) => window.app.openSettingsWindow(tab),
    notify: (notification) => window.dispatchEvent(new CustomEvent('app:notification', { detail: notification }))
  }
  const initials = displayName(profile).split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')

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

  const paletteItems: PaletteItem[] = useMemo(() => [
    { id: 'cmd-new-chat', title: 'New chat', hint: '⌘N', run: () => navigate('home') },
    { id: 'cmd-automations', title: 'Go to Automations', hint: 'Manage', run: () => navigate('automations') },
    { id: 'cmd-settings', title: 'Open Settings', hint: '⌘,', run: () => window.app.openSettingsWindow() },
    { id: 'cmd-connectors', title: 'Open Connectors settings', hint: 'Settings', run: () => window.app.openSettingsWindow('connectors') },
    { id: 'cmd-agents', title: 'Open Agents settings', hint: 'Settings', run: () => window.app.openSettingsWindow('agents') },
    ...threads.slice(0, 8).map((thread) => ({
      id: `chat-${thread.id}`,
      title: thread.title || 'Untitled chat',
      hint: 'Chat',
      run: () => navigate('chat', { chatId: thread.id })
    }))
  ], [router, threads])

  const isCanvasView =
    route.view === 'automations' &&
    (parseAutomationTab(route.params['automationTab']) ?? 'manage') === 'canvas'

  return (
    <main className="shell-frame is-collapsed">
      <header className="shell-drag-strip" aria-label="Window title bar">
        <span className="shell-brand">Palette</span>
        <button
          type="button"
          className="shell-palette-trigger"
          aria-label="Open command palette"
          title="Command palette (⌘K)"
          onClick={() => setPaletteOpen(true)}
        >
          <span>Search or command…</span>
          <kbd>⌘K</kbd>
        </button>
        <span className="shell-drag-spacer" aria-hidden="true" />
      </header>
      <div className="shell-workspace">
        <aside className="shell-sidebar" aria-label="Main navigation">
          <nav className="shell-primary-nav">
            {PRIMARY_NAV.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`shell-nav-item${route.view === item.view ? ' is-active' : ''}`}
                aria-current={route.view === item.view ? 'page' : undefined}
                aria-label={item.label}
                title={item.label}
                onClick={() => navigate(item.view)}
              >
                <Icon name="automation" />
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
          <nav className="shell-primary-nav shell-rail-center" aria-label="Automation views">
            {AUTOMATION_TABS.map((tab) => {
              const active = route.view === 'automations' && (parseAutomationTab(route.params['automationTab']) ?? 'manage') === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  className={`shell-nav-item${active ? ' is-active' : ''}`}
                  aria-current={active ? 'page' : undefined}
                  aria-label={tab.label}
                  title={tab.label}
                  data-tooltip={tab.label}
                  onClick={() => navigate('automations', { automationTab: tab.id })}
                >
                  <Icon name={tab.icon} />
                  <span>{tab.label}</span>
                </button>
              )
            })}
          </nav>
          <footer className="shell-sidebar-footer">
            <button
              type="button"
              className="shell-icon-button shell-notifications-button"
              aria-label={`Notifications${unreadCount ? ` (${unreadCount} unread)` : ''}`}
              aria-expanded={notificationsOpen}
              title="Notifications"
              onClick={() => setNotificationsOpen((open) => !open)}
            >
              <Icon name="bell" />
              {unreadCount > 0 && <span className="shell-notification-badge">{unreadCount > 99 ? '99+' : unreadCount}</span>}
            </button>
            <button
              type="button"
              className="shell-profile-button"
              aria-label={`Account menu for ${displayName(profile)}`}
              aria-expanded={profileMenuOpen}
              aria-haspopup="menu"
              title="Profile"
              onClick={() => {
                setProfileMenuOpen((open) => !open)
                setNotificationsOpen(false)
              }}
            >
              <span className="shell-avatar">{initials || 'L'}</span>
            </button>
            <ProfileMenu
              open={profileMenuOpen}
              name={displayName(profile)}
              email={profile.email.trim()}
              initials={initials}
              onClose={() => setProfileMenuOpen(false)}
              onOpenSettings={(tab) => window.app.openSettingsWindow(tab)}
            />
            {notificationsOpen && (
              <section className="shell-notifications-panel" aria-label="Notifications">
                <header>
                  <strong>Notifications</strong>
                  {unreadCount > 0 && <button type="button" onClick={() => void readAllNotifications()}>Mark all read</button>}
                </header>
                {notifications.length ? (
                  <div className="shell-notifications-list">
                    {notifications.map((notification) => (
                      <article key={notification.id} className={`shell-notification${notification.read ? '' : ' is-unread'}`}>
                        <button type="button" className="shell-notification-body" onClick={() => void readNotification(notification)}>
                          <span>{notification.title}</span>
                          {notification.body && <small>{notification.body}</small>}
                          <time>{new Date(notification.createdAt).toLocaleString()}</time>
                        </button>
                        <button type="button" className="shell-notification-dismiss" aria-label={`Dismiss ${notification.title}`} onClick={() => void dismissNotification(notification.id)}>×</button>
                      </article>
                    ))}
                  </div>
                ) : <p className="shell-notifications-empty">You’re all caught up.</p>}
              </section>
            )}
          </footer>
        </aside>
        <section className="shell-main-pane">
          {(chatError || dashboardError) && (
            <div className="shell-chat-error" role="alert">
              {chatError || dashboardError}
              <button type="button" onClick={() => { setChatError(''); setDashboardError('') }}>Dismiss</button>
            </div>
          )}
          <div className={`shell-content${route.view === 'chat' ? ' has-chat-view' : ''}${!activeFeature && !activeChatId ? ' is-home' : ''}${activeFeature ? ' has-feature' : ''}${isCanvasView ? ' is-canvas-view' : ''}`}>
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
                    onSelectTemplate={(template: AutomationTemplate) => navigate('automations', { templateId: template.id })}
                  />
                </>
              ) : (
                <p className="shell-empty-state">{chatLoading ? 'Loading chat history…' : 'This chat is no longer available.'}</p>
              )
            ) : (
              <HomeView shell={shellApi} />
            )}
          </div>
        </section>
      </div>
      <CommandPalette open={paletteOpen} items={paletteItems} onClose={() => setPaletteOpen(false)} />
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
  )
}
