import { useEffect, useState } from 'react'
import { Button } from '../../components/ui/button.js'
import { getConnectorLogo } from '../connectorLogos.js'
import type { ComposioToolkit } from '../../../main/engines/composio/composio-marketplace.js'

interface ConnectorState {
  configured: boolean
  encryptionAvailable: boolean
  services: Array<{ id: string; connected: boolean; detail?: string }>
  connectedSlugs?: string[]
}

interface BuiltinItem {
  id: string
  name: string
  description: string
  category: string
  iconType?: 'video' | 'phone' | 'email' | 'browser'
  logoSrc?: string
  connected?: boolean
}

const CATEGORIES = ['All', 'Productivity', 'Creativity', 'Business', 'Development', 'Finance', 'Travel', 'Health', 'Custom'] as const

function ConnectorIcon({ type }: { type: NonNullable<BuiltinItem['iconType']> }): React.JSX.Element {
  switch (type) {
    case 'video':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="4" width="20" height="16" rx="4" />
          <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none" />
        </svg>
      )
    case 'phone':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="5" y="2" width="14" height="20" rx="3" />
          <line x1="12" y1="18" x2="12.01" y2="18" strokeWidth="2.5" />
        </svg>
      )
    case 'email':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="4" width="20" height="16" rx="3" />
          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
        </svg>
      )
    case 'browser':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="4" />
          <line x1="21.17" y1="8" x2="12" y2="8" />
          <line x1="3.95" y1="6.06" x2="8.54" y2="14" />
          <line x1="10.88" y1="21.94" x2="15.46" y2="14" />
        </svg>
      )
  }
}

function ConnectorBrandIcon({ item }: { item: BuiltinItem }): React.JSX.Element {
  const logoSrc = item.logoSrc ?? getConnectorLogo(item.id)
  if (logoSrc) {
    return <img src={logoSrc} alt={`${item.name} logo`} />
  }
  return <ConnectorIcon type={item.iconType ?? 'browser'} />
}

export default function ConnectorsTab(): React.JSX.Element {
  const [state, setState] = useState<ConnectorState | null>(null)
  const [toolkits, setToolkits] = useState<ComposioToolkit[]>([])
  const [query, setQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('All')
  const [catalogQuery, setCatalogQuery] = useState('')
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [connecting, setConnecting] = useState<string | null>(null)
  const [connectMessage, setConnectMessage] = useState<string | null>(null)
  const [gmailConnected, setGmailConnected] = useState(false)

  async function refresh(): Promise<void> {
    try {
      const connectorState = (await window.app.getConnector()) as ConnectorState
      setState(connectorState)
      if (connectorState.configured) await searchToolkits(catalogQuery)
      else setToolkits([])
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : 'Could not load connectors.')
    }
    try {
      const gm = (await window.app.connectionStatus('gmail')) as { ok: boolean; connected?: boolean }
      if (gm.ok) setGmailConnected(!!gm.connected)
    } catch { /* ignore */ }
  }

  useEffect(() => {
    void refresh()
    const onFocus = (): void => {
      void refresh()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  async function searchToolkits(search: string): Promise<void> {
    setCatalogLoading(true)
    setCatalogError(null)
    try {
      const result = await window.app.composioToolkits(search)
      if (!result.ok || !result.toolkits) {
        setCatalogError(result.error ?? 'Could not load Composio apps.')
        return
      }
      setToolkits(result.toolkits)
      setCatalogQuery(search)
    } catch (error) {
      setCatalogError(error instanceof Error ? error.message : 'Could not load Composio apps.')
    } finally {
      setCatalogLoading(false)
    }
  }

  async function connectToolkit(slug: string, name: string): Promise<void> {
    setConnecting(slug)
    setConnectMessage(null)
    try {
      if (slug === 'gmail') {
        const res = (await window.app.connectionConnect('gmail')) as { ok: boolean; url?: string; error?: string }
        if (res.ok) {
          setConnectMessage('Opened Gmail connection in browser. Complete authorization, then click Check again.')
          return
        }
      }
      const result = await window.app.composioConnect(slug)
      if (!result.ok) {
        setConnectMessage(result.error ?? `Could not connect ${name}.`)
        return
      }
      setConnectMessage(`Opened ${name} connection in your browser. Complete authorization, then click Check again.`)
    } catch (error) {
      setConnectMessage(error instanceof Error ? error.message : `Could not connect ${name}.`)
    } finally {
      setConnecting(null)
    }
  }

  const isSvcConnected = (id: string, composioSlug?: string): boolean => {
    if (state?.services?.some((s) => s.id === id && s.connected)) return true
    if (composioSlug && state?.connectedSlugs?.includes(composioSlug)) return true
    return false
  }

  const builtinCards: BuiltinItem[] = [
    {
      id: 'gmail',
      name: 'Gmail',
      description: 'Draft replies, search your inbox, and summarize email threads instantly',
      category: 'Productivity',
      logoSrc: getConnectorLogo('gmail'),
      connected: gmailConnected || isSvcConnected('gmail', 'gmail')
    },
    {
      id: 'calendar',
      name: 'Google Calendar',
      description: 'Understand your schedule, manage events, and optimize your time effectively',
      category: 'Productivity',
      logoSrc: getConnectorLogo('calendar'),
      connected: isSvcConnected('calendar', 'googlecalendar')
    },
    {
      id: 'instagram',
      name: 'Instagram',
      description: 'Generate and publish Posts, Stories, or Reels to Instagram',
      category: 'Creativity',
      logoSrc: getConnectorLogo('instagram'),
      connected: isSvcConnected('instagram', 'instagram')
    },
    {
      id: 'notion',
      name: 'Notion',
      description: 'Search workspace content, update notes, and automate workflows in Notion',
      category: 'Productivity',
      logoSrc: getConnectorLogo('notion'),
      connected: isSvcConnected('notion', 'notion')
    },
    {
      id: 'outlook',
      name: 'Outlook Mail',
      description: 'Write, search, and manage your Outlook emails seamlessly within Palette',
      category: 'Productivity',
      logoSrc: getConnectorLogo('outlook'),
      connected: isSvcConnected('outlook', 'outlook')
    },
    {
      id: 'google-workspace',
      name: 'Google Workspace',
      description: 'Access your files, search instantly, and let Palette help you manage documents...',
      category: 'Business',
      logoSrc: getConnectorLogo('google-workspace'),
      connected: isSvcConnected('google-workspace', 'googledrive')
    },
    {
      id: 'slack',
      name: 'Slack',
      description: 'Search, read, and act across your Slack workspace',
      category: 'Business',
      logoSrc: getConnectorLogo('slack'),
      connected: isSvcConnected('slack', 'slack')
    },
    {
      id: 'meta-ads',
      name: 'Meta Ads Manager',
      description: 'Automate ads insights and optimization to save hours and maximize profits',
      category: 'Business',
      logoSrc: getConnectorLogo('meta-ads'),
      connected: isSvcConnected('meta-ads', 'facebook')
    }
  ]

  const filteredCards = builtinCards.filter((card) => {
    const matchesCategory = selectedCategory === 'All' || card.category === selectedCategory
    const matchesQuery = !query.trim() ||
      card.name.toLowerCase().includes(query.toLowerCase()) ||
      card.description.toLowerCase().includes(query.toLowerCase())
    return matchesCategory && matchesQuery
  })

  return (
    <div className="conn-page-container">
      {/* Top Search bar and Create button */}
      <div className="conn-page-top">
        <div className="conn-search-box">
          <svg className="conn-search-ico" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            placeholder="Search connectors"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search connectors"
          />
        </div>
        <button
          type="button"
          className="conn-create-menu-btn"
          style={{ background: 'transparent', border: '1px solid var(--border)' }}
          onClick={() => void refresh()}
          title="Refresh connection status"
        >
          <span>Refresh</span>
        </button>
        <button
          type="button"
          className="conn-create-menu-btn"
          onClick={() => {
            void searchToolkits(query.trim())
          }}
        >
          <span>Create</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      {/* Category Filter Chips */}
      <div className="conn-categories-strip" role="tablist" aria-label="Connector categories">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            role="tab"
            aria-selected={selectedCategory === cat}
            className={`conn-cat-pill${selectedCategory === cat ? ' is-active' : ''}`}
            onClick={() => setSelectedCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Main Connectors Grid */}
      <div className="conn-cards-grid">
        {filteredCards.map((item) => {
          const hasLogo = Boolean(item.logoSrc ?? getConnectorLogo(item.id))
          return (
          <div key={item.id} className="conn-card-item">
            <div className={`conn-card-icon-box${hasLogo ? ' has-logo' : ''}`}>
              <ConnectorBrandIcon item={item} />
            </div>
            <div className="conn-card-info">
              <h4>{item.name}</h4>
              <p>{item.description}</p>
            </div>
            <div className="conn-card-action">
              {item.connected ? (
                <span className="conn-check-btn" title="Connected" aria-label="Connected">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
              ) : (
                <button
                  type="button"
                  className="conn-plus-btn"
                  title={`Connect ${item.name}`}
                  aria-label={`Connect ${item.name}`}
                  disabled={connecting === item.id}
                  onClick={() => {
                    void connectToolkit(item.id, item.name)
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
          )
        })}
      </div>

      {connectMessage && (
        <div className="set-msg" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 }}>
          <span>{connectMessage}</span>
          <Button variant="secondary" size="sm" onClick={() => void refresh()}>Check again</Button>
        </div>
      )}
      {catalogError && <p className="set-msg" role="alert">{catalogError}</p>}

      {/* Composio dynamically loaded toolkits */}
      {state?.configured && toolkits.length > 0 && (
        <section className="composio-marketplace" style={{ marginTop: 24 }}>
          <div className="composio-marketplace-heading">
            <div>
              <h3 className="set-section-title">Composio integrations catalog</h3>
              <p className="composio-marketplace-copy">Explore hundreds of apps and tools connectable through your Composio project.</p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => void searchToolkits(catalogQuery)} disabled={catalogLoading}>
              {catalogLoading ? 'Loading…' : 'Refresh'}
            </Button>
          </div>
          <div className="conn-cards-grid">
            {toolkits.map((toolkit) => (
              <div key={toolkit.slug} className="conn-card-item">
                <div className="conn-card-icon-box">
                  {toolkit.logo ? (
                    <img src={toolkit.logo} alt="" style={{ width: 24, height: 24, objectFit: 'contain' }} />
                  ) : (
                    <span style={{ fontWeight: 700, fontSize: 14 }}>{toolkit.name.slice(0, 1).toUpperCase()}</span>
                  )}
                </div>
                <div className="conn-card-info">
                  <h4>{toolkit.name}</h4>
                  <p>{toolkit.description || `${toolkit.toolsCount ?? 0} available actions`}</p>
                </div>
                <div className="conn-card-action">
                  {toolkit.connected ? (
                    <span className="conn-check-btn" title="Connected">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="conn-plus-btn"
                      title={`Connect ${toolkit.name}`}
                      disabled={connecting !== null}
                      onClick={() => void connectToolkit(toolkit.slug, toolkit.name)}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
