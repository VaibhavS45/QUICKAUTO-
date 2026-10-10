import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import type { JSONSchema7 } from 'ai'
import type { McpConnection, McpConnector, McpServerConfig } from './mcp-registry.js'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isSafeMcpHttpUrl(value: string): boolean {
  const url = new URL(value)
  if (url.protocol === 'https:') return true
  return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
}

export class McpSdkConnector implements McpConnector {
  async connect(config: McpServerConfig, secrets: Record<string, string>): Promise<McpConnection> {
    const client = new Client({ name: 'palette', version: '0.1.0' })
    const transport = config.transport === 'stdio'
      ? new StdioClientTransport({
          command: config.command,
          args: config.args,
          env: secrets,
          stderr: 'ignore'
        })
      : (() => {
          if (!isSafeMcpHttpUrl(config.url)) throw new Error('MCP HTTP servers must use HTTPS or localhost.')
          return new StreamableHTTPClientTransport(new URL(config.url), {
            requestInit: { headers: secrets },
            redirectPolicy: 'same-origin'
          })
        })()

    try {
      await client.connect(transport)
      return {
        listTools: async () => {
          const result = await client.listTools()
          return result.tools.flatMap((item) => isRecord(item.inputSchema)
            ? [{ name: item.name, description: item.description, inputSchema: item.inputSchema as JSONSchema7 }]
            : [])
        },
        callTool: async (name, input) => client.callTool({ name, arguments: input }),
        onClose: (listener) => { transport.onclose = listener },
        close: () => client.close()
      }
    } catch (error) {
      try {
        await client.close()
      } catch (closeError) {
        const message = closeError instanceof Error ? closeError.message : String(closeError)
        throw new AggregateError([error, closeError], `MCP connection failed; cleanup also failed: ${message}`)
      }
      throw error
    }
  }
}
