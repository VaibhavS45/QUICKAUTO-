import { describe, expect, it } from 'vitest'
import { BudgetGuard, MemoryBudgetStore } from '../../src/main/connectors/budget-guard.js'
import {
  COMPOSIO_USER_ID,
  isBudgetGuardedTool,
  type ComposioClientLike
} from '../../src/main/connectors/composio.js'
import {
  DRIVE_DOWNLOAD_SLUG,
  DRIVE_FIND_SLUG,
  DRIVE_MAX_FILES,
  DriveConnectorProvider,
  DriveService
} from '../../src/main/connectors/drive.js'
import { runWithContext } from '../../src/main/agent/run-context.js'
import { attachmentPromptText, needsComposioTools } from '../../src/renderer/lib/attachments.js'

interface ExecCall {
  slug: string
  body: Record<string, unknown>
}

function fakeClient(opts: {
  connected?: boolean
  execute?: (slug: string, body: Record<string, unknown>) => Promise<{ data?: unknown; error?: string | null; successful?: boolean }>
} = {}): { client: ComposioClientLike; calls: ExecCall[] } {
  const calls: ExecCall[] = []
  const client = {
    tools: {
      execute: async (slug: string, body: Record<string, unknown>) => {
        calls.push({ slug, body })
        return opts.execute ? opts.execute(slug, body) : { data: {}, error: null, successful: true }
      }
    },
    connectedAccounts: {
      list: async () => ({ items: opts.connected === false ? [] : [{ id: 'conn-1', status: 'ACTIVE' }] })
    },
    link: async () => ({ redirectUrl: undefined }),
    authConfigs: { list: async () => ({ items: [] }) }
  } as unknown as ComposioClientLike
  return { client, calls }
}

function serviceWith(
  fake: { client: ComposioClientLike; calls: ExecCall[] },
  opts: { key?: string | null } = {}
): DriveService {
  return new DriveService({
    getApiKey: async () => (opts.key === undefined ? 'test-composio-key' : opts.key),
    getGuard: () => new BudgetGuard({ store: new MemoryBudgetStore() }),
    createClient: () => fake.client
  })
}

describe('drive service', () => {
  it('reports not connected without a Composio key and never calls Composio', async () => {
    const fake = fakeClient()
    const res = await serviceWith(fake, { key: null }).listFiles('')
    expect(res).toMatchObject({ ok: false, notConnected: true })
    expect(fake.calls).toHaveLength(0)
  })

  it('reports not connected when there is no ACTIVE googledrive account', async () => {
    const fake = fakeClient({ connected: false })
    const res = await serviceWith(fake).listFiles('')
    expect(res).toMatchObject({ ok: false, notConnected: true })
    expect(fake.calls).toHaveLength(0)
  })

  it('normalizes files and pins the toolkit version under the local user', async () => {
    const fake = fakeClient({
      execute: async () => ({
        data: { files: [{ id: 'f1', name: 'Q3 plan', mimeType: 'application/vnd.google-apps.document' }, { name: 'no id' }] },
        error: null,
        successful: true
      })
    })
    const res = await serviceWith(fake).listFiles('plan')
    expect(res.ok).toBe(true)
    expect(res.ok && res.files).toEqual([
      { id: 'f1', name: 'Q3 plan', mimeType: 'application/vnd.google-apps.document', size: undefined, modifiedTime: undefined, webViewLink: undefined }
    ])
    expect(fake.calls[0]!.slug).toBe(DRIVE_FIND_SLUG)
    expect(fake.calls[0]!.body).toMatchObject({ userId: COMPOSIO_USER_ID, version: expect.any(String) })
    expect(fake.calls[0]!.body['arguments']).toMatchObject({ q: 'plan', page_size: DRIVE_MAX_FILES })
  })

  it('sorts by recency only when there is no search query', async () => {
    const fake = fakeClient({ execute: async () => ({ data: { files: [] }, error: null, successful: true }) })
    await serviceWith(fake).listFiles('')
    expect(fake.calls[0]!.body['arguments']).toMatchObject({ order_by: 'modifiedTime desc' })
  })

  it('surfaces Composio errors instead of throwing', async () => {
    const fake = fakeClient({ execute: async () => ({ data: null, error: 'quota exceeded', successful: false }) })
    const res = await serviceWith(fake).listFiles('')
    expect(res).toMatchObject({ ok: false, error: expect.stringContaining('quota exceeded') })
  })
})

describe('drive provider', () => {
  it('serves gdrive_read under @composio only, and self-guards it', () => {
    const provider = new DriveConnectorProvider({
      getApiKey: async () => 'k',
      getGuard: () => new BudgetGuard({ store: new MemoryBudgetStore() }),
      createClient: () => fakeClient().client
    })
    const tools = provider.getTools(['composio'])
    expect(Object.keys(tools)).toEqual(['gdrive_read'])
    expect(isBudgetGuardedTool(tools['gdrive_read'])).toBe(true)
    expect(provider.getTools(['gmail'])).toEqual({})
    expect(provider.getTools([])).toEqual({})
  })

  it('reads file content through the download slug', async () => {
    const fake = fakeClient({ execute: async () => ({ data: { downloaded_file_content: 'hello drive' }, error: null, successful: true }) })
    const service = serviceWith(fake)
    const out = await runWithContext({ runId: 'test-run', source: 'palette' }, () => service.readFile('f1', 'text/plain'))
    expect(out).toBe('hello drive')
    expect(fake.calls[0]!.slug).toBe(DRIVE_DOWNLOAD_SLUG)
    expect(fake.calls[0]!.body['arguments']).toMatchObject({ fileId: 'f1', mime_type: 'text/plain' })
  })
})

describe('attachment prompt text', () => {
  const local = { ref: '/tmp/a.pdf', name: 'a.pdf', kind: 'local' as const, path: '/tmp/a.pdf' }
  const drive = { ref: 'drive:f1', name: 'Q3 plan', kind: 'drive' as const, driveId: 'f1', mimeType: 'application/vnd.google-apps.document' }

  it('is empty for no files', () => {
    expect(attachmentPromptText([])).toBe('')
  })

  it('points each file at the tool that reads it', () => {
    const text = attachmentPromptText([local, drive])
    expect(text).toContain('read_file path="/tmp/a.pdf"')
    expect(text).toContain('gdrive_read fileId="f1"')
    expect(text).toContain('untrusted DATA')
  })

  it('needs composio tools only for drive files', () => {
    expect(needsComposioTools([local])).toBe(false)
    expect(needsComposioTools([local, drive])).toBe(true)
  })
})