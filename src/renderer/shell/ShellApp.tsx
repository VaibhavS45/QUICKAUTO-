import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FeatureProps, ShellApi } from '../contracts/feature.js'
import type { ChatThread } from '../../shared/chat.js'
import type { AgentEvent } from '../../shared/agent.js'
import { parseMentionedTools } from '../../shared/types.js'
import { ChatComposer } from './ChatComposer.js'
import { ChatView } from './ChatView.js'
import { createChatRunState, reduceChatRun, resolveChatApproval, type ChatRunState } from './chat-state.js'
import { getFeatureRegistry } from './registry.js'
import { PRIMARY_NAV, SIDEBAR_SECTIONS, ShellRouter } from './nav.js'
import './shell.css'

interface LocalProfile {
  name: string
  email: string
}

function Icon({ name }: { name: string }): React.JSX.Element {
  const paths: Record<string, React.ReactNode> = {
    plus: <path d="M12 5v14M5 12h14" />,
    automation: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
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

function errorText(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}

export default function ShellApp(): React.JSX.Element {
  const router = useMemo(() => new ShellRouter(), [])
  const [route, setRoute] = useState(router.current)
  const [collapsed, setCollapsed] = useState(false)
  const [profile, setProfile] = useState<LocalProfile>({ name: '', email: '' })
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [threads, setThreads] = useState<ChatThread[]>([])
  const [chatError, setChatError] = useState('')
  const [chatLoading, setChatLoading] = useState(true)
  const [run, setRun] = useState<ChatRunState | null>(null)
  const [runThreadId, setRunThreadId] = useState('')
  const [busy, setBusy] = useState(false)
  const [chatSearchOpen, setChatSearchOpen] = useState(false)
  const [chatSearch, setChatSearch] = useState('')
  const [renamingId, setRenamingId] = useState('')
  const [renameValue, setRenameValue] = useState('')
  const [pendingDelete, setPendingDelete] = useState<ChatThread | null>(null)
  const [pendingClear, setPendingClear] = useState(false)
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

  const refreshThreads = useCallback(async (): Promise<ChatThread[]> => {
    const result = await window.app.chatList()
    if (!result.ok) throw new Error('Could not load chat history.')
    setThreads(result.threads)
    return result.threads
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
    return () => { active = false }
  }, [refreshThreads])

  useEffect(() => {
    const unsubscribe = router.subscribe(setRoute)
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
        window.app.openSettingsWindow()
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
    setAccountMenuOpen(false)
    setChatError('')
  }

  function openThread(thread: ChatThread): void {
    navigate('chat', { chatId: thread.id })
    setPendingDelete(null)
  }

  const shellApi: ShellApi = {
    navigate,
    openCalendarWindow: () => {},
    openSettings: (tab) => window.app.openSettingsWindow(tab),
    notify: (notification) => window.dispatchEvent(new CustomEvent('app:notification', { detail: notification }))
  }
  const title = activeFeature?.title ?? (
    route.view === 'plugins' ? 'Plugins' :
      activeThread?.title ?? 'New chat'
  )
  const initials = displayName(profile).split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('')
  const visibleThreads = threads
    .filter((thread) => !chatSearchOpen || thread.title.toLowerCase().includes(chatSearch.trim().toLowerCase()))
    .slice(0, chatSearchOpen ? 200 : 15)

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

  async function renameThread(thread: ChatThread): Promise<void> {
    try {
      const result = await window.app.chatRename(thread.id, renameValue)
      if (!result.ok || !result.thread) throw new Error(result.error || 'Could not rename this chat.')
      setThreads((current) => current.map((item) => item.id === thread.id ? result.thread! : item))
      setRenamingId('')
      setRenameValue('')
    } catch (error) {
      setChatError(errorText(error))
    }
  }

  async function deleteThread(thread: ChatThread): Promise<void> {
    try {
      const result = await window.app.chatRemove(thread.id)
      if (!result.ok) throw new Error(result.error || 'Could not delete this chat.')
      setThreads((current) => current.filter((item) => item.id !== thread.id))
      setPendingDelete(null)
      if (activeChatId === thread.id) navigate('home')
    } catch (error) {
      setChatError(errorText(error))
    }
  }

  async function clearChats(): Promise<void> {
    try {
      const result = await window.app.chatClear()
      if (!result.ok) throw new Error(result.error || 'Could not clear chat history.')
      setThreads([])
      setPendingClear(false)
      if (activeChatId) navigate('home')
    } catch (error) {
      setChatError(errorText(error))
    }
  }

  return (
    <main className={`shell-frame${collapsed ? ' is-collapsed' : ''}`}>
      <header className="shell-drag-strip" aria-label="Window title bar">
        <span className="shell-brand">Palette</span>
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
                title={collapsed ? item.label : undefined}
                onClick={() => navigate(item.view)}
              >
                <Icon name={item.id === 'home' ? 'plus' : item.id === 'plugins' ? 'puzzle' : 'automation'} />
                <span>{item.label}</span>
              </button>
            ))}
          </nav>
          <div className="shell-sidebar-sections">
            {SIDEBAR_SECTIONS.slice(0, 2).map((section) => (
              <section className="shell-sidebar-section" key={section} aria-label={section}>
                <h2>{section}</h2>
              </section>
            ))}
            <section className="shell-sidebar-section shell-chats-section" aria-label="Chats">
              <div className="shell-chats-heading">
                <h2>Chats</h2>
                {threads.length > 0 && !collapsed && (
                  <button type="button" aria-label="Show all chats" title="Show all chats" onClick={() => setChatSearchOpen((open) => !open)}>⌕</button>
                )}
              </div>
              {chatSearchOpen && !collapsed && (
                <input
                  className="shell-chat-search"
                  aria-label="Search chats"
                  placeholder="Search chats"
                  value={chatSearch}
                  onChange={(event) => setChatSearch(event.currentTarget.value)}
                />
              )}
              <div className="shell-chat-list">
                {visibleThreads.map((thread) => (
                  <div className={`shell-chat-entry${activeChatId === thread.id ? ' is-active' : ''}`} key={thread.id}>
                    {renamingId === thread.id && !collapsed ? (
                      <form className="shell-chat-rename" onSubmit={(event) => { event.preventDefault(); void renameThread(thread) }}>
                        <input aria-label="Chat title" autoFocus maxLength={80} value={renameValue} onChange={(event) => setRenameValue(event.currentTarget.value)} />
                        <button type="submit" disabled={!renameValue.trim()}>Save</button>
                        <button type="button" onClick={() => setRenamingId('')}>Cancel</button>
                      </form>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="shell-chat-link"
                          title={thread.title}
                          aria-current={activeChatId === thread.id ? 'page' : undefined}
                          onClick={() => openThread(thread)}
                        >
                          <span>{thread.title}</span>
                        </button>
                        {!collapsed && (
                          <div className="shell-chat-actions">
                            <button type="button" aria-label={`Rename ${thread.title}`} title="Rename" onClick={() => { setRenamingId(thread.id); setRenameValue(thread.title) }}>···</button>
                            <button type="button" aria-label={`Delete ${thread.title}`} title="Delete" onClick={() => setPendingDelete(thread)}>×</button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))}
                {!chatLoading && threads.length === 0 && !collapsed && <p className="shell-chat-empty">Your recent chats will appear here.</p>}
                {chatSearchOpen && !collapsed && threads.length > 15 && visibleThreads.length < 200 && !chatSearch && (
                  <span className="shell-chat-count">Showing {visibleThreads.length} of {threads.length}</span>
                )}
              </div>
              {!collapsed && threads.length > 0 && (
                <button type="button" className="shell-clear-chats" onClick={() => setPendingClear(true)}>Clear chat history</button>
              )}
              {pendingDelete && !collapsed && (
                <div className="shell-confirm-card" role="alertdialog" aria-label="Confirm chat deletion">
                  <p>Delete “{pendingDelete.title}” and its messages?</p>
                  <button type="button" onClick={() => setPendingDelete(null)}>Cancel</button>
                  <button type="button" onClick={() => void deleteThread(pendingDelete)}>Delete chat</button>
                </div>
              )}
              {pendingClear && !collapsed && (
                <div className="shell-confirm-card" role="alertdialog" aria-label="Confirm clear chat history">
                  <p>Delete all {threads.length} saved chats?</p>
                  <button type="button" onClick={() => setPendingClear(false)}>Cancel</button>
                  <button type="button" onClick={() => void clearChats()}>Clear all</button>
                </div>
              )}
            </section>
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
                <button type="button" role="menuitem" onClick={() => {
                  window.app.openSettingsWindow('account')
                  setAccountMenuOpen(false)
                }}>
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
                onClick={() => window.app.openSettingsWindow()}
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
          {chatError && <div className="shell-chat-error" role="alert">{chatError}<button type="button" onClick={() => setChatError('')}>Dismiss</button></div>}
          <div className={`shell-content${route.view === 'chat' ? ' has-chat-view' : ''}`}>
            {activeFeature ? (
              <activeFeature.Component shell={shellApi} initialTemplate={route.params['template'] as FeatureProps['initialTemplate']} />
            ) : route.view === 'plugins' ? (
              <p className="shell-empty-state">Plugins are coming soon.</p>
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
                    onOpenSettings={() => window.app.openSettingsWindow('provider')}
                    onOpenAutomations={() => navigate('automations')}
                  />
                </>
              ) : (
                <p className="shell-empty-state">{chatLoading ? 'Loading chat history…' : 'This chat is no longer available.'}</p>
              )
            ) : (
              <ChatComposer
                busy={busy}
                onSend={sendMessage}
                onOpenSettings={() => window.app.openSettingsWindow('provider')}
                onOpenAutomations={() => navigate('automations')}
              />
            )}
          </div>
        </section>
      </div>
    </main>
  )
}
