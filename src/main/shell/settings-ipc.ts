import { z } from 'zod'
import { EmptyShellRequestSchema } from './ipc.js'
import { AgentProfileSchema, type AgentStore } from '../agent/agent-store.js'
import { McpServerConfigSchema, type McpRegistry } from './mcp-registry.js'
import type { PluginRegistry } from './plugin-registry.js'

export const SettingsShellChannels = {
  pluginsList: 'shell:plugins-list',
  pluginEnable: 'shell:plugin-enable',
  mcpList: 'shell:mcp-list',
  mcpUpsert: 'shell:mcp-upsert',
  mcpStart: 'shell:mcp-start',
  mcpStop: 'shell:mcp-stop',
  mcpRemove: 'shell:mcp-remove',
  agentsList: 'shell:agents-list',
  agentCreate: 'shell:agent-create',
  agentUpdate: 'shell:agent-update',
  agentRemove: 'shell:agent-remove'
} as const

export const PluginEnableRequestSchema = z.object({
  id: z.string().min(1).max(64),
  enabled: z.boolean()
}).strict()

export const McpUpsertRequestSchema = z.object({
  config: McpServerConfigSchema,
  secrets: z.record(z.string().max(64), z.string().max(10000)).default({})
}).strict()

export const McpServerIdRequestSchema = z.object({ id: z.string().min(1).max(64) }).strict()

export const AgentRequestSchema = AgentProfileSchema.omit({ builtin: true })
export const AgentUpdateRequestSchema = z.object({
  id: z.string().min(1).max(64),
  agent: AgentRequestSchema
}).strict()

type IpcRegistrar = {
  handle(channel: string, listener: (_event: unknown, payload?: unknown) => unknown): void
}

export function registerSettingsShellIpc(
  ipc: IpcRegistrar,
  plugins: PluginRegistry,
  mcp: McpRegistry,
  agents: AgentStore
): void {
  ipc.handle(SettingsShellChannels.pluginsList, (_event, payload) => {
    if (!EmptyShellRequestSchema.safeParse(payload).success) return { ok: false as const, error: 'Invalid plugin request.' }
    return { ok: true as const, plugins: plugins.list() }
  })
  ipc.handle(SettingsShellChannels.pluginEnable, (_event, payload) => {
    const parsed = PluginEnableRequestSchema.safeParse(payload)
    if (!parsed.success) return { ok: false as const, error: 'Invalid plugin request.' }
    return plugins.setEnabled(parsed.data.id, parsed.data.enabled)
      ? { ok: true as const, plugins: plugins.list() }
      : { ok: false as const, error: 'Plugin not found.' }
  })

  ipc.handle(SettingsShellChannels.mcpList, (_event, payload) => {
    if (!EmptyShellRequestSchema.safeParse(payload).success) return { ok: false as const, error: 'Invalid MCP request.' }
    return { ok: true as const, servers: mcp.list() }
  })
  ipc.handle(SettingsShellChannels.mcpUpsert, async (_event, payload) => {
    const parsed = McpUpsertRequestSchema.safeParse(payload)
    if (!parsed.success) return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Invalid MCP server request.' }
    try {
      const server = await mcp.upsert(parsed.data.config, parsed.data.secrets)
      return { ok: true as const, server }
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : String(error) }
    }
  })
  ipc.handle(SettingsShellChannels.mcpStart, async (_event, payload) => {
    const parsed = McpServerIdRequestSchema.safeParse(payload)
    if (!parsed.success) return { ok: false as const, error: 'Invalid MCP server id.' }
    try {
      const server = await mcp.start(parsed.data.id)
      return server ? { ok: true as const, server } : { ok: false as const, error: 'MCP server not found.' }
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : String(error) }
    }
  })
  ipc.handle(SettingsShellChannels.mcpStop, async (_event, payload) => {
    const parsed = McpServerIdRequestSchema.safeParse(payload)
    if (!parsed.success) return { ok: false as const, error: 'Invalid MCP server id.' }
    try {
      const server = await mcp.stop(parsed.data.id)
      return server ? { ok: true as const, server } : { ok: false as const, error: 'MCP server not found.' }
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : String(error) }
    }
  })
  ipc.handle(SettingsShellChannels.mcpRemove, async (_event, payload) => {
    const parsed = McpServerIdRequestSchema.safeParse(payload)
    if (!parsed.success) return { ok: false as const, error: 'Invalid MCP server id.' }
    try {
      return await mcp.remove(parsed.data.id)
        ? { ok: true as const }
        : { ok: false as const, error: 'MCP server not found.' }
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipc.handle(SettingsShellChannels.agentsList, (_event, payload) => {
    if (!EmptyShellRequestSchema.safeParse(payload).success) return { ok: false as const, error: 'Invalid agent request.' }
    return { ok: true as const, agents: agents.list() }
  })
  ipc.handle(SettingsShellChannels.agentCreate, (_event, payload) => {
    const parsed = AgentRequestSchema.safeParse(payload)
    if (!parsed.success) return { ok: false as const, error: 'Invalid agent profile.' }
    try {
      return { ok: true as const, agent: agents.create(parsed.data) }
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : String(error) }
    }
  })
  ipc.handle(SettingsShellChannels.agentUpdate, (_event, payload) => {
    const parsed = AgentUpdateRequestSchema.safeParse(payload)
    if (!parsed.success) return { ok: false as const, error: 'Invalid agent profile.' }
    try {
      return { ok: true as const, agent: agents.update(parsed.data.id, parsed.data.agent) }
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : String(error) }
    }
  })
  ipc.handle(SettingsShellChannels.agentRemove, (_event, payload) => {
    const parsed = McpServerIdRequestSchema.safeParse(payload)
    if (!parsed.success) return { ok: false as const, error: 'Invalid agent id.' }
    try {
      return agents.remove(parsed.data.id)
        ? { ok: true as const }
        : { ok: false as const, error: 'Agent not found.' }
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : String(error) }
    }
  })
}
