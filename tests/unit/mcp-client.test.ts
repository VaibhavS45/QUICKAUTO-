import { describe, expect, it } from 'vitest'
import { McpSdkConnector } from '../../src/main/shell/mcp-client.js'

const serverScript = `
const readline = require('node:readline')
const input = readline.createInterface({ input: process.stdin })
input.on('line', (line) => {
  const request = JSON.parse(line)
  if (request.id === undefined) return
  let result
  if (request.method === 'initialize') {
    result = {
      protocolVersion: request.params.protocolVersion,
      capabilities: { tools: {} },
      serverInfo: { name: 'test-mcp-server', version: '1.0.0' }
    }
  } else if (request.method === 'tools/list') {
    result = {
      tools: [{
        name: 'echo_text',
        description: 'Echo provided text',
        inputSchema: { type: 'object', properties: { text: { type: 'string' } } }
      }]
    }
  } else if (request.method === 'tools/call') {
    result = { content: [{ type: 'text', text: request.params.arguments.text }] }
  } else {
    result = {}
  }
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\\n')
})
`

describe('McpSdkConnector', () => {
  it('connects to a stdio server, lists tools, and executes a tool call', async () => {
    const connector = new McpSdkConnector()
    const connection = await connector.connect({
      id: 'test',
      name: 'Test MCP',
      transport: 'stdio',
      command: process.execPath,
      args: ['-e', serverScript],
      envKeys: []
    }, {})
    try {
      await expect(connection.listTools()).resolves.toEqual([{
        name: 'echo_text',
        description: 'Echo provided text',
        inputSchema: { type: 'object', properties: { text: { type: 'string' } } }
      }])
      await expect(connection.callTool?.('echo_text', { text: 'hello MCP' })).resolves.toMatchObject({
        content: [{ text: 'hello MCP' }]
      })
    } finally {
      await connection.close()
    }
  })

  it('surfaces stderr diagnostics when a stdio server fails during startup', async () => {
    await expect(new McpSdkConnector().connect({
      id: 'broken',
      name: 'Broken MCP',
      transport: 'stdio',
      command: process.execPath,
      args: ['-e', 'console.error("test server startup diagnostic"); process.stdout.write("not json\\\\n")'],
      envKeys: []
    }, {})).rejects.toThrow(/test server startup diagnostic/)
  })
})
