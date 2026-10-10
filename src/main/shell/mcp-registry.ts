import { z } from 'zod'
import type { JSONSchema7 } from 'ai'

const ServerIdSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/)
const SecretKeySchema = z.string().regex(/^[A-Z_][A-Z0-9_]{0,63}$/i)
const McpUrlSchema = z.string().url().max(2000).refine((value) => {
  const url = new URL(value)
  return !url.username && !url.password && ![...url.searchParams.keys()].some((key) =>
    /(key|token|secret|password|auth)/i.test(key)
  )
}, 'Do not put credentials in the MCP URL; use encrypted header secrets.')
const McpArgsSchema = z.array(z.string().max(1000)).max(64).refine((args) =>
  !args.some((arg) => /(?:api[_-]?key|access[_-]?token|token|secret|password|authorization)\s*[:=]/i.test(arg)) &&
  !args.some((arg) => /^--?(?:api[_-]?key|access[_-]?token|token|secret|password|authorization)$/i.test(arg))
, 'Do not put credentials in MCP arguments; use encrypted environment secrets.')

export const McpServerConfigSchema = z.discriminatedUnion('transport', [
  z.object({
    id: ServerIdSchema,
    name: z.string().trim().min(1).max(100),
    transport: z.literal('stdio'),
    command: z.string().trim().min(1).max(1000),
    args: McpArgsSchema.default([]),
    envKeys: z.array(SecretKeySchema).max(32).default([])
  }).strict(),
  z.object({
    id: ServerIdSchema,
    name: z.string().trim().min(1).max(100),
    transport: z.literal('http'),
    url: McpUrlSchema,
    headerKeys: z.array(SecretKeySchema).max(32).default([])
  }).strict()
])

export type McpServerConfig = z.infer<typeof McpServerConfigSchema>

export interface McpToolDefinition {
  name: string
  description?: string
  inputSchema: JSONSchema7
}

export interface McpConnection {
  listTools(): Promise<McpToolDefinition[]>
  callTool?(name: string, input: Record<string, unknown>): Promise<unknown>
  onClose?(listener: () => void): void
  close(): Promise<void>
}

export interface McpConnector {
  connect(config: McpServerConfig, secrets: Record<string, string>): Promise<McpConnection>
}

export interface McpRegistryStorage {
  get(key: string): unknown
  set(key: string, value: unknown): void
}

export interface SecretVault {
  set(key: string, value: string): Promise<void>
  get(key: string): Promise<string | null>
  delete(key: string): Promise<void>
}

export type McpServerStatus = 'stopped' | 'running' | 'error'
export type McpServerPublic = McpServerConfig & {
  status: McpServerStatus
  toolCount: number
  error?: string
}

interface ActiveServer {
  connection: McpConnection
  tools: McpToolDefinition[]
}

const SERVERS_KEY = 'mcp-servers'

function secretNames(config: McpServerConfig): string[] {
  return config.transport === 'stdio' ? config.envKeys : config.headerKeys
}

function scrubSecrets(message: string, secrets: string[]): string {
  return secrets.filter(Boolean).reduce((text, secret) => text.split(secret).join('[redacted]'), message)
}

export class McpRegistry {
  private configs: McpServerConfig[]
  private active = new Map<string, ActiveServer>()
  private errors = new Map<string, string>()

  constructor(
    private readonly storage: McpRegistryStorage,
    private readonly vault: SecretVault,
    private readonly connector: McpConnector
  ) {
    const raw = storage.get(SERVERS_KEY)
    const configs: McpServerConfig[] = []
    if (Array.isArray(raw)) {
      for (const item of raw) {
        const parsed = McpServerConfigSchema.safeParse(item)
        if (parsed.success && !configs.some((config) => config.id === parsed.data.id)) configs.push(parsed.data)
      }
    }
    this.configs = configs
  }

  list(): McpServerPublic[] {
    return this.configs.map((config) => {
      const active = this.active.get(config.id)
      const error = this.errors.get(config.id)
      return {
        ...config,
        status: active ? 'running' : error ? 'error' : 'stopped',
        toolCount: active?.tools.length ?? 0,
        ...(error ? { error } : {})
      }
    })
  }

  async upsert(input: unknown, secrets: Record<string, string> = {}): Promise<McpServerPublic> {
    const parsed = McpServerConfigSchema.safeParse(input)
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Invalid MCP server configuration.')
    const allowed = new Set(secretNames(parsed.data))
    if (Object.keys(secrets).some((key) => !allowed.has(key)) || [...allowed].some((key) => secrets[key] !== undefined && typeof secrets[key] !== 'string')) {
      throw new Error('Secret keys must be declared in the server configuration.')
    }
    const previous = this.configs.find((config) => config.id === parsed.data.id)
    if (this.active.has(parsed.data.id)) await this.stop(parsed.data.id)
    const oldNames = previous ? secretNames(previous) : []
    const newNames = secretNames(parsed.data)
    for (const [key, value] of Object.entries(secrets)) await this.vault.set(this.vaultKey(parsed.data.id, key), value)
    for (const key of oldNames) {
      if (!newNames.includes(key)) await this.vault.delete(this.vaultKey(parsed.data.id, key))
    }
    const next = previous
      ? this.configs.map((config) => config.id === parsed.data.id ? parsed.data : config)
      : [...this.configs, parsed.data]
    this.persist(next)
    return this.publicState(parsed.data)
  }

  async start(id: string): Promise<McpServerPublic | null> {
    const config = this.configs.find((item) => item.id === id)
    if (!config) return null
    const current = this.active.get(id)
    if (current) return this.publicState(config)
    const secrets: Record<string, string> = {}
    let connection: McpConnection | null = null
    try {
      for (const key of secretNames(config)) {
        const value = await this.vault.get(this.vaultKey(id, key))
        if (value !== null) secrets[key] = value
      }
      connection = await this.connector.connect(config, secrets)
      const tools = await connection.listTools()
      this.errors.delete(id)
      this.active.set(id, { connection, tools })
      connection.onClose?.(() => {
        if (this.active.get(id)?.connection !== connection) return
        this.active.delete(id)
        this.errors.set(id, 'MCP server disconnected.')
      })
      return this.publicState(config)
    } catch (error) {
      let message = error instanceof Error ? error.message : String(error)
      if (connection) {
        try {
          await connection.close()
        } catch (closeError) {
          const closeMessage = closeError instanceof Error ? closeError.message : String(closeError)
          message += `; connection cleanup failed: ${closeMessage}`
        }
      }
      this.errors.set(id, scrubSecrets(message, Object.values(secrets)))
      return this.publicState(config)
    }
  }

  async stop(id: string): Promise<McpServerPublic | null> {
    const config = this.configs.find((item) => item.id === id)
    if (!config) return null
    const active = this.active.get(id)
    if (active) {
      await active.connection.close()
      this.active.delete(id)
    }
    this.errors.delete(id)
    return this.publicState(config)
  }

  async remove(id: string): Promise<boolean> {
    const config = this.configs.find((item) => item.id === id)
    if (!config) return false
    await this.stop(id)
    for (const key of secretNames(config)) await this.vault.delete(this.vaultKey(id, key))
    this.persist(this.configs.filter((item) => item.id !== id))
    return true
  }

  getTools(): Array<{ serverId: string; serverName: string; tool: McpToolDefinition; execute: (input: Record<string, unknown>) => Promise<unknown> }> {
    const result: Array<{ serverId: string; serverName: string; tool: McpToolDefinition; execute: (input: Record<string, unknown>) => Promise<unknown> }> = []
    for (const [serverId, active] of this.active) {
      const serverName = this.configs.find((config) => config.id === serverId)?.name ?? serverId
      for (const tool of active.tools) {
        result.push({
          serverId,
          serverName,
          tool,
          execute: async (input) => {
            const current = this.active.get(serverId)
            if (!current?.connection.callTool) throw new Error(`MCP server "${serverName}" cannot execute tools.`)
            return current.connection.callTool(tool.name, input)
          }
        })
      }
    }
    return result
  }

  private async publicState(config: McpServerConfig): Promise<McpServerPublic> {
    const active = this.active.get(config.id)
    const error = this.errors.get(config.id)
    return {
      ...config,
      status: active ? 'running' : error ? 'error' : 'stopped',
      toolCount: active?.tools.length ?? 0,
      ...(error ? { error } : {})
    }
  }

  private persist(configs: McpServerConfig[]): void {
    this.storage.set(SERVERS_KEY, configs)
    this.configs = configs
  }

  private vaultKey(serverId: string, key: string): string {
    return `mcp:${serverId}:${key}`
  }
}
