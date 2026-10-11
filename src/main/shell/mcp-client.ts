import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import type { JSONSchema7 } from 'ai'
import type { McpConnection, McpConnector, McpServerConfig } from './mcp-registry.js'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function withTimeout<T>(operation: () => Promise<T>, message: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), 15_000)
      })
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

export function isSafeMcpHttpUrl(value: string): boolean {
  try {
    const url = new URL(value)
    if (url.protocol === 'https:') return true
    return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  } catch {
    return false
  }
}

export class McpSdkConnector implements McpConnector {
  async connect(config: McpServerConfig, secrets: Record<string, string>): Promise<McpConnection> {
    const client = new Client({ name: 'palette', version: '0.1.0' })
    let stderr = ''
    let transport: StdioClientTransport | StreamableHTTPClientTransport
    if (config.transport === 'stdio') {
      const stdioTransport = new StdioClientTransport({
        command: config.command,
        args: config.args,
        env: secrets,
        stderr: 'pipe'
      })
      stdioTransport.stderr?.on('data', (chunk: Buffer | string) => {
        stderr = `${stderr}${chunk.toString()}`.slice(-3000)
      })
      transport = stdioTransport
    } else {
      if (!isSafeMcpHttpUrl(config.url)) throw new Error('MCP HTTP servers must use HTTPS or localhost.')
      transport = new StreamableHTTPClientTransport(new URL(config.url), {
        requestInit: { headers: secrets },
        redirectPolicy: 'same-origin'
      })
    }

    try {
      await withTimeout(() => client.connect(transport), 'MCP server did not respond within 15 seconds.')
      return {
        listTools: async () => {
          try {
            const result = await withTimeout(() => client.listTools(), 'MCP server did not list tools within 15 seconds.')
            return result.tools.flatMap((item) => isRecord(item.inputSchema)
              ? [{ name: item.name, description: item.description, inputSchema: item.inputSchema as JSONSchema7 }]
              : [])
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            const details = stderr.trim()
            throw new Error(details ? `${message}\nMCP process output: ${details}` : message)
          }
        },
        callTool: async (name, input) => client.callTool({ name, arguments: input }),
        onClose: (listener) => { transport.onclose = listener },
        close: () => client.close()
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const details = stderr.trim()
      const failure = details ? new Error(`${message}\nMCP process output: ${details}`) : error
      try {
        await client.close()
      } catch (closeError) {
        const message = closeError instanceof Error ? closeError.message : String(closeError)
        throw new AggregateError([failure, closeError], `MCP connection failed; cleanup also failed: ${message}`)
      }
      throw failure
    }
  }
}
