import { jsonSchema, tool, type ToolSet } from 'ai'
import type { ConnectorProvider } from '../connectors/provider.js'
import type { ToolId } from '../../shared/types.js'
import type { McpRegistry } from './mcp-registry.js'

function toolName(serverId: string, name: string, index: number): string {
  const safeServer = serverId.replace(/[^a-zA-Z0-9_]/g, '_')
  const safeTool = name.replace(/[^a-zA-Z0-9_]/g, '_')
  const suffix = `_${index}`
  const serverPart = safeServer.slice(0, 16)
  const toolLimit = Math.max(1, 63 - 4 - serverPart.length - 1 - suffix.length)
  return `mcp_${serverPart}_${safeTool.slice(0, toolLimit)}${suffix}`
}

export class McpConnectorProvider implements ConnectorProvider {
  readonly id = 'mcp'

  constructor(private readonly registry: McpRegistry) {}

  getTools(toolIds: ToolId[]): ToolSet {
    if (!toolIds.includes('mcp')) return {}
    const tools: ToolSet = {}
    this.registry.getTools().forEach((entry, index) => {
      const name = toolName(entry.serverId, entry.tool.name, index)
      tools[name] = tool({
        description: `[MCP server: ${entry.serverName}] ${entry.tool.description ?? entry.tool.name}`,
        inputSchema: jsonSchema<Record<string, unknown>>(entry.tool.inputSchema),
        execute: entry.execute
      })
    })
    return tools
  }

  status(toolId: ToolId): { connected: boolean; detail?: string } {
    if (toolId !== 'mcp') return { connected: false }
    const running = this.registry.list().filter((server) => server.status === 'running')
    return { connected: running.length > 0, detail: `${running.length} MCP server${running.length === 1 ? '' : 's'} running` }
  }

  connect(): Promise<{ ok: boolean; error?: string }> {
    return Promise.resolve({ ok: false, error: 'Start an MCP server from Settings → MCP.' })
  }
}
