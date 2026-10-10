import { describe, expect, it } from 'vitest'
import { buildToolApproval } from '../../src/main/agent/tools.js'
import { AgentStore, MAX_AGENTS } from '../../src/main/agent/agent-store.js'
import { isSafeMcpHttpUrl } from '../../src/main/shell/mcp-client.js'
import { McpConnectorProvider } from '../../src/main/shell/mcp-provider.js'
import {
  McpRegistry,
  type McpConnection,
  type McpConnector,
  type McpRegistryStorage,
  type McpServerConfig,
  type McpToolDefinition,
  type SecretVault
} from '../../src/main/shell/mcp-registry.js'
import { SafeStorageMcpVault } from '../../src/main/shell/mcp-vault.js'
import {
  registerSettingsShellIpc,
  SettingsShellChannels
} from '../../src/main/shell/settings-ipc.js'
import { PluginRegistry } from '../../src/main/shell/plugin-registry.js'

function memory(): McpRegistryStorage & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>()
  return { data, get: (key) => data.get(key), set: (key, value) => void data.set(key, value) }
}

function vault(): SecretVault & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    set: async (key, value) => void data.set(key, value),
    get: async (key) => data.get(key) ?? null,
    delete: async (key) => void data.delete(key)
  }
}

const serverTools: McpToolDefinition[] = [{
  name: 'write_document',
  description: 'Write a document.',
  inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] }
}]

function fakeConnector(
  onConnect: (config: McpServerConfig, secrets: Record<string, string>) => Promise<McpConnection> = async () => ({
    listTools: async () => serverTools,
    callTool: async (_name, input) => ({ content: input }),
    close: async () => {}
  })
): McpConnector {
  return { connect: onConnect }
}

describe('PluginRegistry', () => {
  it('loads only valid manifests and persists enablement', () => {
    const store = memory()
    const registry = new PluginRegistry(store)
    expect(registry.load([
      { id: 'valid-plugin', name: 'Valid', version: '1.0.0', description: 'A test' },
      { id: '../bad', name: 'Bad', version: '1' },
      { id: 'duplicate', name: 'First', version: '1' },
      { id: 'duplicate', name: 'Second', version: '1' },
      { id: 'secret-bearing', name: 'Unexpected', version: '1', token: 'do-not-expose' }
    ])).toEqual({ loaded: 3, rejected: 2 })
    expect(registry.setEnabled('valid-plugin', true)).toBe(true)
    expect(registry.setEnabled('unknown', true)).toBe(false)
    expect(registry.list().find((plugin) => plugin.id === 'valid-plugin')?.enabled).toBe(true)
    expect(JSON.stringify(registry.list())).not.toContain('do-not-expose')
    expect('token' in (registry.list().find((plugin) => plugin.id === 'secret-bearing') ?? {})).toBe(false)
    const reloaded = new PluginRegistry(store)
    reloaded.load([{ id: 'valid-plugin', name: 'Valid', version: '1.0.0' }])
    expect(reloaded.list()[0]?.enabled).toBe(true)
  })
})

describe('AgentStore', () => {
  it('parses corrupt input, caps at 20, and protects the built-in Chat agent', () => {
    const storage = memory()
    storage.set('agents', [null, { id: 'invalid id', name: 'Invalid', systemPrompt: '' }])
    const agents = new AgentStore(storage)
    expect(agents.list()).toEqual([expect.objectContaining({ id: 'chat', builtin: true })])
    agents.create({ id: 'review', name: 'Review', systemPrompt: 'Review carefully.' })
    agents.update('review', { id: 'review', name: 'Code review', systemPrompt: 'Review code.' })
    for (let index = 0; index < MAX_AGENTS + 4; index++) {
      const id = `agent-${index}`
      try {
        agents.create({ id, name: id, systemPrompt: '' })
      } catch {
        break
      }
    }
    expect(agents.list()).toHaveLength(MAX_AGENTS)
    expect(() => agents.remove('chat')).toThrow(/cannot be deleted/i)
    expect(() => agents.update('chat', { id: 'chat', name: 'Changed', systemPrompt: '' })).toThrow(/cannot be edited/i)
    expect(agents.remove('review')).toBe(true)
    expect(agents.remove('missing')).toBe(false)
  })
})

describe('McpRegistry and approval provider', () => {
  it('stores declared secrets out of public state, manages servers, and approval-gates tools', async () => {
    const store = memory()
    const secrets = vault()
    let seenSecrets: Record<string, string> = {}
    let closed = 0
    const connector = fakeConnector(async (_config, input) => {
      seenSecrets = input
      return {
        listTools: async () => serverTools,
        callTool: async (_name, args) => ({ content: args }),
        close: async () => { closed++ }
      }
    })
    const registry = new McpRegistry(store, secrets, connector)
    await registry.upsert(
      { id: 'writer', name: 'Writer', transport: 'stdio', command: 'npx', args: ['server'], envKeys: ['TOKEN'] },
      { TOKEN: 'secret-token-123' }
    )
    expect(JSON.stringify(registry.list())).not.toContain('secret-token-123')
    expect(secrets.data.get('mcp:writer:TOKEN')).toBe('secret-token-123')
    const running = await registry.start('writer')
    expect(running?.status).toBe('running')
    expect(running?.toolCount).toBe(1)
    expect(seenSecrets).toEqual({ TOKEN: 'secret-token-123' })

    const provider = new McpConnectorProvider(registry)
    const toolSet = provider.getTools(['mcp'])
    const [name] = Object.keys(toolSet)
    expect(name).toMatch(/^mcp_writer_write_document_/)
    expect(buildToolApproval('chat', [name as string])[name as string]).toBe('user-approval')
    expect(buildToolApproval('scheduled', [name as string])[name as string]).toEqual(expect.objectContaining({ type: 'denied' }))
    expect(provider.status('mcp').connected).toBe(true)
    await registry.stop('writer')
    expect(closed).toBe(1)
    expect(await registry.remove('writer')).toBe(true)
    expect(secrets.data.has('mcp:writer:TOKEN')).toBe(false)
  })

  it('rejects undeclared secrets and scrubs startup failures', async () => {
    const secrets = vault()
    const registry = new McpRegistry(memory(), secrets, fakeConnector(async () => {
      throw new Error('failed with secret-token-123')
    }))
    const config = { id: 'broken', name: 'Broken', transport: 'http', url: 'https://example.com/mcp', headerKeys: ['TOKEN'] } as const
    await expect(registry.upsert(config, { OTHER: 'x' })).rejects.toThrow(/declared/i)
    await expect(registry.upsert({
      id: 'unsafe-url',
      name: 'Unsafe URL',
      transport: 'http',
      url: 'https://example.com/mcp?api_key=plaintext',
      headerKeys: []
    })).rejects.toThrow(/credentials/i)
    await expect(registry.upsert({
      id: 'unsafe-args',
      name: 'Unsafe arguments',
      transport: 'stdio',
      command: 'node',
      args: ['--token', 'plaintext'],
      envKeys: []
    })).rejects.toThrow(/credentials/i)
    await registry.upsert(config, { TOKEN: 'secret-token-123' })
    expect((await registry.start('broken'))?.status).toBe('error')
    expect(registry.list()[0]?.error).not.toContain('secret-token-123')
  })

  it('reports unexpected server disconnects without polling', async () => {
    let disconnected = (): void => {}
    const connector = fakeConnector(async () => ({
      listTools: async () => serverTools,
      callTool: async () => ({}),
      onClose: (listener) => { disconnected = listener },
      close: async () => {}
    }))
    const registry = new McpRegistry(memory(), vault(), connector)
    await registry.upsert({ id: 'disconnect', name: 'Disconnect', transport: 'stdio', command: 'node' })
    await registry.start('disconnect')
    disconnected()
    expect(registry.list()[0]?.status).toBe('error')
    expect(registry.list()[0]?.error).toBe('MCP server disconnected.')
  })

  it('accepts secure HTTP endpoints and only permits plaintext localhost', () => {
    expect(isSafeMcpHttpUrl('https://mcp.example.com/server')).toBe(true)
    expect(isSafeMcpHttpUrl('http://localhost:3000/mcp')).toBe(true)
    expect(isSafeMcpHttpUrl('http://127.0.0.1:3000/mcp')).toBe(true)
    expect(isSafeMcpHttpUrl('http://mcp.example.com/server')).toBe(false)
  })
})

describe('SafeStorageMcpVault', () => {
  it('writes only encrypted bytes to its electron-store adapter', async () => {
    const store = memory()
    const vaultStore = new SafeStorageMcpVault(store, {
      encryptStringAsync: async (value) => Buffer.from(`cipher:${value}`),
      decryptStringAsync: async (value) => Buffer.from(value).toString().replace(/^cipher:/, '')
    })
    await vaultStore.set('TOKEN', 'sensitive-value')
    expect(store.get('TOKEN')).not.toContain('sensitive-value')
    expect(await vaultStore.get('TOKEN')).toBe('sensitive-value')
    await vaultStore.delete('TOKEN')
    expect(await vaultStore.get('TOKEN')).toBeNull()
  })
})

describe('settings shell IPC', () => {
  it('validates requests and exposes CRUD through shell-namespaced handlers', async () => {
    const handlers = new Map<string, (_event: unknown, payload?: unknown) => unknown>()
    const ipc = { handle: (channel: string, listener: (_event: unknown, payload?: unknown) => unknown) => handlers.set(channel, listener) }
    const plugins = new PluginRegistry(memory())
    plugins.load([{ id: 'p', name: 'Plugin', version: '1.0' }])
    const mcp = new McpRegistry(memory(), vault(), fakeConnector())
    const agents = new AgentStore(memory())
    registerSettingsShellIpc(ipc, plugins, mcp, agents)

    const call = (channel: string, payload: unknown = {}) => handlers.get(channel)?.({}, payload)
    expect((call(SettingsShellChannels.pluginEnable, { id: 'p', enabled: true }) as { ok: boolean }).ok).toBe(true)
    expect(call(SettingsShellChannels.pluginEnable, { id: 'p', enabled: 'yes' })).toEqual({ ok: false, error: 'Invalid plugin request.' })
    expect(call(SettingsShellChannels.pluginsList, { unexpected: true })).toEqual({ ok: false, error: 'Invalid plugin request.' })
    expect(call(SettingsShellChannels.agentCreate, { id: 'bad id', name: 'Bad', systemPrompt: '' })).toEqual({ ok: false, error: 'Invalid agent profile.' })
    expect((call(SettingsShellChannels.agentsList) as { agents: unknown[] }).agents).toHaveLength(1)
  })
})
