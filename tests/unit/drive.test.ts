import { describe, expect, it } from 'vitest'
import {
  DriveService,
  DRIVE_DOWNLOAD_SLUG,
  DRIVE_LIST_SLUG,
  DRIVE_NOT_CONNECTED,
  DriveConnectorProvider
} from '../../src/main/connectors/drive.js'
import { BudgetGuard, MemoryBudgetStore } from '../../src/main/engines/composio/budget-guard.js'
import { currentOrFallbackContext, runWithContext } from '../../src/main/agent/run-context.js'

interface ExecCall {
  slug: string
  args: Record<string, unknown>
}

function fakeClient(response: unknown, opts: { failSlugs?: string[] } = {}): {
  client: unknown
  calls: ExecCall[]
  wrapperCalls: number
} {
  const calls: ExecCall[] = []
  let wrapperCalls = 0
  const client = {
    tools: {
      execute: async (slug: string, body: { arguments?: Record<string, unknown> }) => {
        calls.push({ slug, args: body.arguments ?? {} })
        return response
      }
    },
    connectedAccounts: {
      list: async () => {
        wrapperCalls++
        return { items: [{ id: 'acc-1', status: 'ACTIVE' }] }
      }
    }
  }
  void opts
  return { client, calls, wrapperCalls }
}

function serviceWith(client: unknown): { service: DriveService; guard: BudgetGuard } {
  const guard = new BudgetGuard({ store: new MemoryBudgetStore() })
  const service = new DriveService({
    getApiKey: async () => 'ak_test',
    getGuard: () => guard,
    createClient: () => client as never
  })
  return { service, guard }
}

describe('DriveService.listFiles', () => {
  it('returns normalized files including folders', async () => {
    const { client, calls } = fakeClient({
      data: {
        files: [
          { id: 'f1', name: 'Spec.pdf', mimeType: 'application/pdf', size: '1024' },
          { id: 'f2', name: 'Projects', mimeType: 'application/vnd.google-apps.folder' },
          { name: 'no id here' }
        ]
      }
    })
    const { service } = serviceWith(client)
    const res = await service.listFiles('')
    expect(res.ok).toBe(true)
    expect(res.files).toEqual([
      { id: 'f1', name: 'Spec.pdf', mimeType: 'application/pdf', size: '1024', modifiedTime: undefined, webViewLink: undefined },
      { id: 'f2', name: 'Projects', mimeType: 'application/vnd.google-apps.folder', folder: true, size: undefined, modifiedTime: undefined, webViewLink: undefined }
    ])
    expect(calls[0]!.slug).toBe(DRIVE_LIST_SLUG)
    expect(calls[0]!.args['pageSize']).toBe(25)
    expect(calls[0]!.args['q']).toBeUndefined()
  })

  it('reports notConnected without metering the guard', async () => {
    const guard = new BudgetGuard({ store: new MemoryBudgetStore() })
    const client = {
      tools: { execute: async () => ({}) },
      connectedAccounts: { list: async () => ({ items: [] }) }
    }
    const service = new DriveService({ getApiKey: async () => 'ak_x', getGuard: () => guard, createClient: () => client as never })
    const res = await service.listFiles('report')
    expect(res.ok).toBe(false)
    expect(res.notConnected).toBe(true)
    expect(guard.status().used).toBe(0)
  })

  it('fails cleanly with no Composio key', async () => {
    const guard = new BudgetGuard({ store: new MemoryBudgetStore() })
    const service = new DriveService({ getApiKey: async () => null, getGuard: () => guard })
    const res = await service.listFiles('')
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/Composio API key/i)
  })

  it('caches identical searches so a repeat costs zero meter hits', async () => {
    const { client, calls } = fakeClient({ data: { files: [{ id: 'f1', name: 'A', mimeType: 'text/plain' }] } })
    const { service, guard } = serviceWith(client)
    await service.listFiles('a')
    const second = await service.listFiles('a')
    expect(second.ok).toBe(true)
    expect(calls).toHaveLength(1)
    expect(guard.status().used).toBe(1)
  })
})

describe('DriveService.readFile', () => {
  it('downloads workspace content through the pinned toolkit version', async () => {
    const { client, calls } = fakeClient({ data: { downloaded_file_content: 'the entire text' } })
    const { service, guard } = serviceWith(client)
    const out = await runWithContext({ runId: 'r1', source: 'chat', signal: undefined }, async () =>
      service.readFile('abc_FILE-1', 'TXT')
    )
    expect(out).toMatchObject({ fetched: true, content: 'the entire text', exportFormat: 'TXT' })
    expect(calls[0]).toMatchObject({ slug: DRIVE_DOWNLOAD_SLUG, args: { fileId: 'abc_FILE-1', mime_type: 'TXT' } })
    expect(guard.status().used).toBe(1)
  })

  it('falls back to skipping the version check when the pin is stale', async () => {
    let wrapperCalls = 0
    const calls: ExecCall[] = []
    let skipCheck = false
    const client = {
      tools: {
        execute: async (_slug: string, body: { arguments?: Record<string, unknown>; dangerouslySkipVersionCheck?: boolean }) => {
          if (wrapperCalls === 0 && !skipCheck) {
            wrapperCalls++
            skipCheck = body.dangerouslySkipVersionCheck === true
            throw new Error('ComposioToolVersionRequiredError: version required')
          }
          calls.push({ slug: DRIVE_DOWNLOAD_SLUG, args: body.arguments ?? {} })
          return { data: { downloaded_file_content: 'ok' } }
        }
      },
      connectedAccounts: { list: async () => ({ items: [{ id: 'a', status: 'ACTIVE' }] }) }
    }
    const { service } = serviceWith(client)
    const out = await service.readFile('abcde12345')
    expect(out).toMatchObject({ content: 'ok' })
    expect(calls).toHaveLength(1)
  })

  it('refuses malformed file ids with a clear message', async () => {
    const { client } = fakeClient({ data: { downloaded_file_content: 'x' } })
    const { service, guard } = serviceWith(client)
    const out = await runWithContext({ runId: 'r1', source: 'chat', signal: undefined }, async () =>
      service.readFile('../etc/passwd')
    )
    expect(typeof out).toBe('string')
    expect(String(out)).toMatch(/Invalid Drive file id/)
    expect(guard.status().used).toBe(0)
  })

  it('returns a not-connected marker instead of inventing content', async () => {
    const client = {
      tools: { execute: async () => ({}) },
      connectedAccounts: { list: async () => ({ items: [] }) }
    }
    const { service } = serviceWith(client)
    const out = await runWithContext({ runId: 'r1', source: 'chat', signal: undefined }, async () =>
      service.readFile('abcdefghij')
    )
    expect(String(out)).toContain(DRIVE_NOT_CONNECTED)
  })
})

describe('DriveConnectorProvider', () => {
  it('serves gdrive_read tools only for the @composio mention', () => {
    const provider = new DriveConnectorProvider({
      getApiKey: async () => 'ak_test',
      getGuard: () => new BudgetGuard({ store: new MemoryBudgetStore() })
    })
    expect(Object.keys(provider.getTools(['gmail']))).toEqual([])
    const tools = provider.getTools(['composio']) as Record<string, unknown>
    expect(Object.keys(tools)).toEqual(['gdrive_read'])
  })
})

describe('run-context absence', () => {
  it('falls back to a context when none is active for reads', async () => {
    expect(currentOrFallbackContext().runId).toBeTruthy()
  })
})
