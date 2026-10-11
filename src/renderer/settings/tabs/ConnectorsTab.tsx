import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { Button } from '../../components/ui/button.js'
import { Card, CardSub, CardTitle, Hint } from '../../components/ui/card.js'
import { Input } from '../../components/ui/input.js'
import type { ComposioToolkit } from '../../../main/connectors/composio-marketplace.js'
import { buildConnectorRows, type ConnectorRow } from '../connectors.js'

interface ConnectorState {
  configured: boolean
  encryptionAvailable: boolean
  services: Array<{ id: string; connected: boolean; detail?: string }>
}

interface GhStatus {
  ok: boolean
  installed?: boolean
  authenticated?: boolean
  detail?: string
  error?: string
}

function ConnectorAvatar({ row }: { row: ConnectorRow }): React.JSX.Element {
  return (
    <span
      className="connector-avatar flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg font-semibold"
      style={{ backgroundColor: row.id === 'github' ? '#fff' : '#1c1c1e', color: row.color, border: '1px solid #2c2c2e' }}
    >
      {row.id === 'github' ? (
        <img src="https://github.githubassets.com/favicons/favicon.svg" alt="" className="connector-brand-icon" />
      ) : row.id === 'websearch' ? <Search size={19} aria-hidden /> : row.glyph}
    </span>
  )
}

/**
 * Connectors tab: integration list (Image-3 style) backed by real statuses.
 * Gmail connects in-app (browser OAuth); GitHub authenticates in the terminal
 * (`gh auth login`, token never stored); notion/sheets/websearch ride one
 * Composio project key kept encrypted in main.
 */
export default function ConnectorsTab(): React.JSX.Element {
  const [state, setState] = useState<ConnectorState | null>(null)
  const [key, setKey] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [gh, setGh] = useState<GhStatus | null>(null)
  const [repos, setRepos] = useState<Array<{ path: string; repo: string; testCommand?: string }>>([])
  const [newPath, setNewPath] = useState('')
  const [newRepo, setNewRepo] = useState('')
  const [repoMsg, setRepoMsg] = useState<string | null>(null)
  const [toolkits, setToolkits] = useState<ComposioToolkit[]>([])
  const [query, setQuery] = useState('')
  const [catalogQuery, setCatalogQuery] = useState('')
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [catalogLoading, setCatalogLoading] = useState(false)
  const [connecting, setConnecting] = useState<string | null>(null)
  const [connectMessage, setConnectMessage] = useState<string | null>(null)
  const [confirmClearKey, setConfirmClearKey] = useState(false)

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
      setGh((await window.app.githubStatus()) as GhStatus)
    } catch {
      setGh({ ok: false, error: 'Could not check gh status.' })
    }
    try {
      const m = (await window.app.getModelSettings()) as { githubRepos?: Array<{ path: string; repo: string; testCommand?: string }> }
      setRepos(m.githubRepos ?? [])
    } catch { /* keep current */ }
  }

  useEffect(() => {
    void refresh()
  }, [])

  async function saveKey(): Promise<void> {
    setMsg(null)
    let res: { ok: boolean; error?: string }
    try {
      res = (await window.app.setConnectorKey(key.trim())) as { ok: boolean; error?: string }
    } catch {
      setMsg('Could not save the Composio key.')
      return
    }
    if (!res.ok) {
      setMsg(res.error ?? 'Save failed.')
      return
    }
    setKey('')
    setMsg('Key verified and saved securely.')
    await refresh()
  }

  async function clearKey(): Promise<void> {
    setMsg(null)
    try {
      const result = (await window.app.clearConnectorKey()) as { ok: boolean; error?: string }
      if (!result.ok) {
        setMsg(result.error ?? 'Could not remove the saved key.')
        return
      }
      setConfirmClearKey(false)
      setToolkits([])
      setMsg('Saved key removed from this app. Revoke it in the Composio dashboard too if it is still active.')
      await refresh()
    } catch (error) {
      setMsg(error instanceof Error ? error.message : 'Could not remove the saved key.')
    }
  }

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

  async function connectToolkit(toolkit: ComposioToolkit): Promise<void> {
    setConnecting(toolkit.slug)
    setConnectMessage(null)
    try {
      const result = await window.app.composioConnect(toolkit.slug)
      if (!result.ok) {
        setConnectMessage(result.error ?? `Could not connect ${toolkit.name}.`)
        return
      }
      setConnectMessage(`Finish connecting ${toolkit.name} in your browser, then refresh the app list.`)
    } catch (error) {
      setConnectMessage(error instanceof Error ? error.message : `Could not connect ${toolkit.name}.`)
    } finally {
      setConnecting(null)
    }
  }

  async function saveRepos(next: Array<{ path: string; repo: string; testCommand?: string }>): Promise<void> {
    setRepoMsg(null)
    try {
      const m = (await window.app.getModelSettings()) as {
        provider: string; model: string; baseUrl?: string; resetDay?: number; autoApprove?: string[]
      }
      const res = (await window.app.setModelSettings({
        provider: m.provider,
        model: m.model,
        baseUrl: m.baseUrl,
        resetDay: m.resetDay,
        githubRepos: next,
        autoApprove: m.autoApprove
      })) as { ok: boolean; error?: string }
      if (!res.ok) {
        setRepoMsg(res.error ?? 'Save failed.')
        return
      }
      setRepos(next)
      setRepoMsg('Saved.')
    } catch {
      setRepoMsg('Save failed.')
    }
  }

  const rows = buildConnectorRows({
    configured: state?.configured ?? false,
    services: state?.services ?? [],
    gmailConnected: null,
    ghInstalled: gh?.installed,
    ghAuthenticated: gh?.authenticated,
    ghDetail: gh ? (gh.ok ? gh.detail : gh.error) : undefined
  }).filter((row) => row.id === 'github' || row.id === 'websearch')

  const orderedToolkits = [...toolkits].sort((a, b) => {
    const priority = (toolkit: ComposioToolkit): number => {
      const name = `${toolkit.name} ${toolkit.slug}`.toLowerCase()
      if (name.includes('gmail')) return 0
      if (name.includes('google meet')) return 1
      if (name.includes('notion')) return 2
      if (name.includes('sheet')) return 3
      if (name.includes('github')) return 4
      return 5
    }
    return priority(a) - priority(b) || a.name.localeCompare(b.name)
  })

  return (
    <div className="set-stack">
      <div className="settings-page-intro">
        <h2>Connectors</h2>
        <p>Connect services the assistant can use. Each connection shows its current status and setup requirements.</p>
      </div>
      {state && (
        <Card>
          <CardTitle>{state.configured ? 'Composio project key' : 'Connect Composio'}</CardTitle>
          <CardSub>
            {state.configured
              ? 'A key is stored securely on this device. Enter a new key to replace it; the saved key is never shown here.'
              : 'Add a Composio project key to browse and connect apps such as Gmail, GitHub, Google Sheets, Google Meet and Notion. It is encrypted by the app and never sent to the renderer.'}
            {' '}The key needs both Session management and Session tool execution permissions in your Composio project.
            {!state.encryptionAvailable && ' Secure credential storage is currently unavailable, so a key cannot be saved.'}
          </CardSub>
          <div className="set-row">
            <div className="set-grow">
              <Input monospace type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Paste a new ak_ project key" aria-label="Composio project key" autoComplete="new-password" />
            </div>
            <Button onClick={() => void saveKey()} disabled={!key.trim() || !state.encryptionAvailable}>{state.configured ? 'Replace key' : 'Save key'}</Button>
            {state.configured && <Button variant="destructive" onClick={() => setConfirmClearKey(true)}>Remove key</Button>}
          </div>
          {msg && <p className="set-msg">{msg}</p>}
          {confirmClearKey && (
            <div className="composio-key-confirm" role="alertdialog" aria-label="Confirm saved key removal">
              <p>Remove the key stored in this app? This does not revoke it in Composio; revoke the old key from the Composio dashboard separately.</p>
              <div className="set-row">
                <Button variant="secondary" size="sm" onClick={() => setConfirmClearKey(false)}>Keep key</Button>
                <Button variant="destructive" size="sm" onClick={() => void clearKey()}>Remove saved key</Button>
              </div>
            </div>
          )}
        </Card>
      )}
      {state?.configured && (
        <section className="composio-marketplace">
          <div className="composio-marketplace-heading">
            <div>
              <h3 className="set-section-title">Composio app catalog</h3>
              <p className="composio-marketplace-copy">Search hundreds of apps and connect securely through Composio. Actions that change data ask for approval first.</p>
            </div>
            <Button variant="secondary" size="sm" onClick={() => void searchToolkits(catalogQuery)} disabled={catalogLoading}>
              {catalogLoading ? 'Loading…' : 'Refresh'}
            </Button>
          </div>
          <form
            className="composio-search"
            onSubmit={(event) => {
              event.preventDefault()
              void searchToolkits(query.trim())
            }}
          >
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search apps (e.g. Google Meet)" aria-label="Search Composio apps" />
            <Button type="submit" variant="secondary" disabled={catalogLoading}>{catalogLoading ? 'Searching…' : 'Search apps'}</Button>
          </form>
          {catalogError && <p className="set-msg" role="alert">{catalogError}</p>}
          {connectMessage && <p className="set-msg" role="status">{connectMessage}</p>}
          <div className="grid gap-3 md:grid-cols-2 settings-connector-grid">
            {orderedToolkits.map((toolkit) => (
              <article key={toolkit.slug} className="connector-card composio-app-card">
                <div className="composio-app-brand">
                  {toolkit.logo ? (
                    <img src={toolkit.logo} alt="" className="composio-app-logo" />
                  ) : (
                    <span className="composio-app-monogram" aria-hidden>{toolkit.name.slice(0, 1).toUpperCase()}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="composio-app-title">
                    <p className="text-sm font-medium text-neutral-100">{toolkit.name}</p>
                    {toolkit.connected && <span className="connector-status is-connected">Connected</span>}
                  </div>
                  <p className="connector-detail" title={toolkit.description}>{toolkit.description || `${toolkit.toolsCount ?? 0} available actions`}</p>
                </div>
                {toolkit.connected ? (
                  <span className="connector-status is-connected">Ready</span>
                ) : (
                  <Button variant="secondary" size="sm" onClick={() => void connectToolkit(toolkit)} disabled={connecting !== null}>
                    {connecting === toolkit.slug ? 'Opening…' : 'Connect'}
                  </Button>
                )}
              </article>
            ))}
          </div>
          {catalogLoading && orderedToolkits.length === 0 && <p className="set-empty-note">Loading apps…</p>}
          {!catalogLoading && !catalogError && orderedToolkits.length === 0 && (
            <p className="set-empty-note">{catalogQuery ? `No apps found for “${catalogQuery}”.` : 'No apps are available right now.'}</p>
          )}
        </section>
      )}
      <section>
        <h3 className="set-section-title">Built-in connections</h3>
        <div className="grid gap-3 md:grid-cols-2 settings-connector-grid">
        {rows.map((row) => (
          <div key={row.id} className="connector-card flex items-center gap-3">
            <ConnectorAvatar row={row} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-neutral-100">{row.name}</p>
              <p className="connector-detail" title={row.detail ?? row.blurb}>{row.detail ?? row.blurb}</p>
            </div>
            {row.status === 'connected' ? (
              <span className="connector-status is-connected">Connected</span>
            ) : row.action === 'refresh-github' ? (
              <Button variant="secondary" size="sm" onClick={() => void refresh()}>Refresh</Button>
            ) : null}
          </div>
        ))}
        </div>
        {rows.length === 0 && <p className="set-empty-note">{state ? 'No built-in connections are available.' : 'Checking connector status…'}</p>}
      </section>
      <Card>
        <CardTitle>GitHub repos</CardTitle>
        <CardSub>Limit @github access to these local repositories. Run `gh auth login` in a terminal if GitHub is not connected.</CardSub>
        <div className="set-list">
          {repos.length === 0 && <p className="set-list-empty">No repos yet.</p>}
          {repos.map((r) => (
            <div key={r.repo.toLowerCase()} className="set-list-item">
              <span className="mono">{r.repo}</span>
              <span className="dim" title={r.path}>{r.path}</span>
              <span className="spacer" />
              <button onClick={() => void saveRepos(repos.filter((x) => x.repo.toLowerCase() !== r.repo.toLowerCase()))} className="set-link-danger">
                Remove
              </button>
            </div>
          ))}
        </div>
        <div className="set-row">
          <div className="set-grow">
            <Input monospace value={newPath} onChange={(e) => setNewPath(e.target.value)} placeholder="/home/you/code/repo" aria-label="Local path" />
          </div>
          <Input monospace value={newRepo} onChange={(e) => setNewRepo(e.target.value)} placeholder="owner/name" aria-label="owner/name" />
          <Button
            onClick={() => {
              const path = newPath.trim()
              const repo = newRepo.trim()
              if (!path || !repo) {
                setRepoMsg('Enter both a local path and owner/name.')
                return
              }
              if (repos.some((r) => r.repo.toLowerCase() === repo.toLowerCase())) {
                setRepoMsg(`"${repo}" is already in the list.`)
                return
              }
              setNewPath('')
              setNewRepo('')
              void saveRepos([...repos, { path, repo }])
            }}
          >
            Add
          </Button>
        </div>
        {repoMsg && <p className="set-msg">{repoMsg}</p>}
        <Hint>Each path must exist and be a git repo whose origin matches owner/name.</Hint>
      </Card>
    </div>
  )
}
