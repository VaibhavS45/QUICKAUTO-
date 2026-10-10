import { useCallback, useEffect, useState } from 'react'
import type { McpServerConfig, McpServerPublic } from '../../../main/shell/mcp-registry.js'
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
    setArgs(server.transport === 'stdio' ? server.args.join(' ') : '')
    setUrl(server.transport === 'http' ? server.url : '')
    const keys = server.transport === 'stdio' ? server.envKeys : server.headerKeys
    setSecretText(keys.map((key) => `${key}=`).join('\n'))
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
    const config: McpServerConfig = transport === 'stdio'
      ? { id, name, transport, command, args: args.trim() ? args.trim().split(/\s+/) : [], envKeys: secretKeys }
      : { id, name, transport, url, headerKeys: secretKeys }
    try {
      const result = await window.app.mcpUpsert(config, secrets)
      if (!result.ok) throw new Error(result.error || 'Could not save MCP server.')
      resetForm()
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
      <Card>
        <CardTitle>MCP servers ({servers.length})</CardTitle>
        <CardSub>Configure local stdio or HTTPS/localhost streamable HTTP servers. Started server tools are available through @mcp; every call requires your approval.</CardSub>
        {servers.length === 0 ? <p className="pt-3 text-xs text-neutral-500">No MCP servers configured.</p> : (
          <div className="space-y-2 pt-3">
            {servers.map((server) => (
              <div key={server.id} className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-sm text-neutral-100">{server.name}</span>
                  <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-[10px] uppercase text-neutral-300">{server.status}</span>
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
      <Card>
        <CardTitle>{id ? `Edit ${name || 'MCP server'}` : 'Add MCP server'}</CardTitle>
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
              <Input value={args} onChange={(event) => setArgs(event.target.value)} placeholder="Arguments separated by spaces" aria-label="Arguments" />
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
          <p className="text-[11px] text-neutral-500">Credential values are encrypted with Electron safeStorage and never returned to the UI. Put credentials only here—not in the command, arguments, or URL. Leave an existing value blank to keep it unchanged.</p>
          <div className="flex gap-2">
            <Button type="submit">{id && servers.some((server) => server.id === id) ? 'Save server' : 'Add server'}</Button>
            {id && <Button type="button" variant="secondary" onClick={resetForm}>Cancel</Button>}
          </div>
        </form>
      </Card>
      {error && <p className="text-xs text-red-300" role="alert">{error}</p>}
    </div>
  )
}
