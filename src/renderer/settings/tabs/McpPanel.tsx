import { useCallback, useEffect, useState } from 'react'
import { parseMcpArgs, type McpServerConfig, type McpServerPublic } from '../../../main/shell/mcp-registry.js'
import { Button } from '../../components/ui/button.js'
import { Card, CardSub, CardTitle } from '../../components/ui/card.js'
import { Input, Select } from '../../components/ui/input.js'

type Transport = 'stdio' | 'http'

function keyValueLines(text: string): Array<[string, string]> {
  return text.split(/[;\r\n]+/).map((line): [string, string] => {
    const index = line.indexOf('=')
    return index < 0 ? [line.trim(), ''] : [line.slice(0, index).trim(), line.slice(index + 1)]
  }).filter(([key]) => /^[A-Z_][A-Z0-9_]{0,63}$/i.test(key))
}

function secretKeyNames(text: string): string[] {
  return [...new Set(keyValueLines(text).map(([key]) => key))]
}

export default function McpPanel(): React.JSX.Element {
  const [servers, setServers] = useState<McpServerPublic[]>([])
  const [transport, setTransport] = useState<Transport>('stdio')
  const [id, setId] = useState('')
  const [name, setName] = useState('')
  const [command, setCommand] = useState('')
  const [args, setArgs] = useState('')
  const [url, setUrl] = useState('')
  const [secretText, setSecretText] = useState('')
  const [pendingRemove, setPendingRemove] = useState('')
  const [error, setError] = useState('')
  // Add/edit form is collapsed by default; the server list is the page.
  const [showForm, setShowForm] = useState(false)

  const refresh = useCallback(async (): Promise<void> => {
    const result = await window.app.mcpList()
    if (!result.ok || !result.servers) throw new Error(result.error || 'Could not load MCP servers.')
    setServers(result.servers)
  }, [])

  useEffect(() => {
    void refresh().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)))
  }, [refresh])

  function edit(server: McpServerPublic): void {
    setId(server.id)
    setName(server.name)
    setTransport(server.transport)
    setCommand(server.transport === 'stdio' ? server.command : '')
    setArgs(server.transport === 'stdio' ? server.args.map((arg) => JSON.stringify(arg)).join(' ') : '')
    setUrl(server.transport === 'http' ? server.url : '')
    const keys = server.transport === 'stdio' ? server.envKeys : server.headerKeys
    setSecretText(keys.map((key) => `${key}=`).join('\n'))
    setShowForm(true)
  }

  function resetForm(): void {
    setId('')
    setName('')
    setCommand('')
    setArgs('')
    setUrl('')
    setSecretText('')
  }

  async function save(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setError('')
    const lines = keyValueLines(secretText)
    const secrets = Object.fromEntries(lines.filter(([, value]) => value.length > 0))
    const secretKeys = secretKeyNames(secretText)
    try {
      const config: McpServerConfig = transport === 'stdio'
        ? { id, name, transport, command, args: parseMcpArgs(args), envKeys: secretKeys }
        : { id, name, transport, url, headerKeys: secretKeys }
      const result = await window.app.mcpUpsert(config, secrets)
      if (!result.ok) throw new Error(result.error || 'Could not save MCP server.')
      resetForm()
      setShowForm(false)
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }

  async function toggle(server: McpServerPublic): Promise<void> {
    setError('')
    try {
      const result = server.status === 'running'
        ? await window.app.mcpStop(server.id)
        : await window.app.mcpStart(server.id)
      if (!result.ok) throw new Error(result.error || `Could not ${server.status === 'running' ? 'stop' : 'start'} MCP server.`)
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }

  async function remove(idToRemove: string): Promise<void> {
    setError('')
    try {
      const result = await window.app.mcpRemove(idToRemove)
      if (!result.ok) throw new Error(result.error || 'Could not remove MCP server.')
      setPendingRemove('')
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }

  return (
    <div className="space-y-4">
      <div className="settings-page-intro">
        <h2>MCP servers</h2>
        <p>Configure local tools or streamable HTTP servers. Calls made through MCP always require your approval.</p>
      </div>
      <Card>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Configured servers <span className="settings-count">{servers.length}</span></CardTitle>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              if (showForm) resetForm()
              setShowForm((open) => !open)
            }}
          >
            {showForm ? 'Cancel' : 'Add server'}
          </Button>
        </div>
        <CardSub>Started server tools are available through @mcp.</CardSub>
        {servers.length === 0 ? (
          <div className="set-empty-state">
            <span className="set-empty-icon" aria-hidden>⌘</span>
            <h4>No servers configured</h4>
            <p>Add a local process or streamable HTTP server below to make its tools available.</p>
          </div>
        ) : (
          <div className="space-y-2 pt-3">
            {servers.map((server) => (
              <div key={server.id} className="mcp-server-card">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`mcp-server-mark${server.status === 'running' ? ' is-running' : ''}`} aria-hidden>⌘</span>
                  <span className="font-medium text-sm text-neutral-100">{server.name}</span>
                  <span className={`mcp-status${server.status === 'running' ? ' is-running' : ''}`}>{server.status}</span>
                  {server.status === 'running' && <span className="text-xs text-neutral-500">{server.toolCount} tools</span>}
                  <span className="flex-1" />
                  <Button variant="secondary" size="sm" onClick={() => edit(server)}>Edit</Button>
                  <Button variant="secondary" size="sm" onClick={() => void toggle(server)}>{server.status === 'running' ? 'Stop' : 'Start'}</Button>
                  <Button variant="destructive" size="sm" onClick={() => setPendingRemove(server.id)}>Remove</Button>
                </div>
                {server.error && <p className="pt-2 text-xs text-red-300">{server.error}</p>}
                {pendingRemove === server.id && (
                  <div className="mt-2 rounded-md border border-amber-700/50 bg-amber-950/30 p-2" role="alertdialog" aria-label="Confirm MCP server removal">
                    <p className="text-xs text-amber-100">Remove this server and its encrypted credentials?</p>
                    <div className="flex gap-2 pt-2">
                      <Button variant="secondary" size="sm" onClick={() => setPendingRemove('')}>Cancel</Button>
                      <Button variant="destructive" size="sm" onClick={() => void remove(server.id)}>Remove server</Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
      {(showForm || Boolean(id)) && (
      <Card>
        <CardTitle>{id ? `Edit ${name || 'MCP server'}` : 'Add MCP server'}</CardTitle>
        <CardSub>{transport === 'stdio' ? 'Run a local executable and pass its arguments.' : 'Connect to an HTTP server on a trusted remote host or localhost.'}</CardSub>
        <form className="space-y-3 pt-3" onSubmit={(event) => void save(event)}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input value={id} onChange={(event) => setId(event.target.value)} placeholder="server-id" aria-label="Server ID" />
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Server name" aria-label="Server name" />
          </div>
          <Select value={transport} onChange={(event) => setTransport(event.target.value as Transport)} aria-label="MCP transport">
            <option value="stdio">Local stdio process</option>
            <option value="http">Streamable HTTP</option>
          </Select>
          {transport === 'stdio' ? (
            <>
              <Input value={command} onChange={(event) => setCommand(event.target.value)} placeholder="Executable, e.g. npx" aria-label="Command" />
              <Input value={args} onChange={(event) => setArgs(event.target.value)} placeholder={'Arguments, e.g. -y @modelcontextprotocol/server-filesystem "/home/you/My Files"'} aria-label="Arguments" />
            </>
          ) : (
            <Input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https:// or http://localhost URL" aria-label="Server URL" />
          )}
          <Input
            type="password"
            value={secretText}
            onChange={(event) => setSecretText(event.target.value)}
            placeholder={transport === 'stdio' ? 'Environment secrets: KEY=value; KEY2=value' : 'Request headers: KEY=value; KEY2=value'}
            aria-label="MCP server credentials"
          />
          <p className="text-[11px] text-neutral-500">Credential values are encrypted with Electron safeStorage and never returned to the UI. Put credentials only here—not in the command, arguments, or URL. Quote arguments that contain spaces. After saving, select Start; running tools then appear when you mention @mcp.</p>
          <div className="flex gap-2">
            <Button type="submit">{id && servers.some((server) => server.id === id) ? 'Save server' : 'Add server'}</Button>
            <Button type="button" variant="secondary" onClick={() => { resetForm(); setShowForm(false) }}>Cancel</Button>
          </div>
        </form>
      </Card>
      )}
      {error && <p className="text-xs text-red-300" role="alert">{error}</p>}
    </div>
  )
}
