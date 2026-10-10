import { useEffect, useState } from 'react'
import { Button } from '../../components/ui/button.js'
import { Card, CardSub, CardTitle, Hint } from '../../components/ui/card.js'
import { Input } from '../../components/ui/input.js'
import { useGmailConnect } from '../../hooks/useGmailConnect.js'
import { buildConnectorRows, type ConnectorRow } from '../connectors.js'

interface ConnectorState {
  configured: boolean
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
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg font-semibold"
      style={{ backgroundColor: '#1c1c1e', color: row.color, border: '1px solid #2c2c2e' }}
      aria-hidden
    >
      {row.glyph}
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
  const g = useGmailConnect()

  async function refresh(): Promise<void> {
    try {
      setState((await window.app.getConnector()) as ConnectorState)
    } catch { /* keep current */ }
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
    const res = (await window.app.setConnectorKey(key.trim())) as { ok: boolean; error?: string }
    if (!res.ok) {
      setMsg(res.error ?? 'Save failed.')
      return
    }
    setKey('')
    setMsg('Saved.')
    setState((await window.app.getConnector()) as ConnectorState)
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
    gmailConnected: g.status?.connected ?? null,
    gmailDetail: g.status?.detail,
    ghInstalled: gh?.installed,
    ghAuthenticated: gh?.authenticated,
    ghDetail: gh ? (gh.ok ? gh.detail : gh.error) : undefined
  })

  return (
    <div className="set-stack">
      {state && !state.configured && (
        <Card>
          <CardTitle>Composio project key</CardTitle>
          <CardSub>One key unlocks Notion, Sheets and Web Search. Encrypted in the main process.</CardSub>
          <div className="set-row">
            <div className="set-grow">
              <Input monospace type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="ak_…" aria-label="Composio project key" />
            </div>
            <Button onClick={() => void saveKey()}>Save</Button>
          </div>
          {msg && <p className="set-msg">{msg}</p>}
        </Card>
      )}
      <div className="grid gap-x-8 md:grid-cols-2">
        {rows.map((row) => (
          <div key={row.id} className="flex items-center gap-3 border-b border-neutral-800/60 py-4">
            <ConnectorAvatar row={row} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-neutral-100">{row.name}</p>
              <p className="truncate text-xs text-neutral-500" title={row.detail ?? row.blurb}>{row.detail ?? row.blurb}</p>
              {row.id === 'gmail' && g.message && <p className="set-msg">{g.message}</p>}
            </div>
            {row.status === 'connected' ? (
              <span className="rounded-full bg-neutral-800 px-3 py-1.5 text-xs text-neutral-400">Connected ✓</span>
            ) : row.action === 'connect-gmail' ? (
              <Button variant="secondary" size="sm" onClick={() => void g.connect()} disabled={g.connecting}>
                {g.connecting ? 'Waiting…' : 'Connect'}
              </Button>
            ) : row.action === 'refresh-github' ? (
              <Button variant="secondary" size="sm" onClick={() => void refresh()}>Refresh</Button>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => void saveKey()} disabled={!key.trim()} title="Enter the Composio key above first">
                Connect
              </Button>
            )}
          </div>
        ))}
      </div>
      {rows.length === 0 && <p className="text-sm text-neutral-500">Loading…</p>}
      <Card>
        <CardTitle>GitHub repos</CardTitle>
        <CardSub>Only these repos are accessible to @github. Terminal fix: `gh auth login`, then Refresh.</CardSub>
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
