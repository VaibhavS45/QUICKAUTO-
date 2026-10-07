import { describe, expect, it, vi } from 'vitest'
import type { ToolSet } from 'ai'
import {
  ComposioConnectorProvider,
  GMAIL_GET_SLUG,
  GMAIL_LABELS_SLUG,
  GMAIL_MAX_RESULTS,
  GMAIL_NOT_CONNECTED,
  GMAIL_READ_TOOLS,
  GMAIL_SEARCH_SLUG,
  GMAIL_SYSTEM_PROMPT,
  type ComposioClientLike
} from '../../src/main/connectors/composio.js'
import { BudgetGuard, MemoryBudgetStore } from '../../src/main/connectors/budget-guard.js'
import { runWithContext } from '../../src/main/agent/run-context.js'
import { buildInstructions } from '../../src/main/agent/registry.js'

const MESSAGES = [
  { messageId: 'aaa', threadId: 't1', sender: 'jobs@example.com', subject: 'Offer letter', internalDate: '2026-10-05T10:00:00Z', snippet: 'We are pleased to offer you the role…' },
  { messageId: 'bbb', threadId: 't2', sender: 'upstox@example.com', subject: 'Market alert', internalDate: '2026-10-06T10:00:00Z', snippet: 'NIFTY crossed 25,000…' },
  { messageId: 'ccc', threadId: 't3', sender: 'old@example.com', subject: 'Old mail', internalDate: '2026-09-01T10:00:00Z', snippet: 'hello from september' }
]

function fakeClient(opts: { connected?: boolean; authConfigs?: Array<{ id: string }> } = {}) {
  const connected = opts.connected ?? true
  return {
    tools: {
      execute: vi.fn(async (slug: string) => {
        if (slug === GMAIL_SEARCH_SLUG) {
          return { data: { messages: MESSAGES }, error: null, successful: true }
        }
        if (slug === GMAIL_GET_SLUG) {
          return { data: { message: MESSAGES[0] }, error: null, successful: true }
        }
        if (slug === GMAIL_LABELS_SLUG) {
          return { data: { labels: [{ id: 'INBOX', name: 'INBOX', type: 'system' }] }, error: null, successful: true }
        }
        throw new Error(`unexpected slug ${slug}`)
      })
    },
    connectedAccounts: {
      list: vi.fn(async () => ({ items: connected ? [{ id: 'ca_1', status: 'ACTIVE' }] : [] })),
      link: vi.fn(async () => ({ redirectUrl: 'https://composio.example/auth' }))
    },
    authConfigs: {
      list: vi.fn(async () => ({ items: opts.authConfigs ?? [{ id: 'ac_gmail_managed' }] }))
    }
  }
}

function providerWith(client: ReturnType<typeof fakeClient>, apiKey: string | null = 'ckey') {
  const guard = new BudgetGuard({ store: new MemoryBudgetStore() })
  const provider = new ComposioConnectorProvider({
    getApiKey: async () => apiKey,
    getGuard: () => guard,
    createClient: () => client as unknown as ComposioClientLike
  })
  return { provider, guard, client }
}

type AnyTool = { execute: (input: never, opts?: never) => Promise<unknown> }

function getTools(p: ComposioConnectorProvider, ids: Array<'gmail'> = ['gmail']): Record<string, AnyTool> {
  return p.getTools(ids) as unknown as Record<string, AnyTool>
}

describe('Gmail tool surface (read-only, fixed slugs)', () => {
  it('exposes exactly the three read tools for @gmail', () => {
    const { provider } = providerWith(fakeClient())
    const tools = getTools(provider)
    expect(Object.keys(tools).sort()).toEqual([...GMAIL_READ_TOOLS].sort())
  })

  it('exposes nothing without the gmail mention', () => {
    const { provider } = providerWith(fakeClient())
    expect(provider.getTools([])).toEqual({})
    expect(provider.getTools(['github'])).toEqual({})
  })

  it('contains no write/send/draft/delete slugs anywhere', () => {
    const { provider } = providerWith(fakeClient())
    const src = JSON.stringify(Object.keys(getTools(provider)))
    expect(src).not.toMatch(/send|draft|delete|trash|modify|patch|create|forward/i)
  })
})

describe('gmail_search', () => {
  it('returns newest-first compact summaries in ONE call', async () => {
    const { provider, guard, client } = providerWith(fakeClient())
    const out = (await runWithContext({ runId: 'r1', source: 'palette' }, () =>
      getTools(provider)['gmail_search']!.execute({ query: 'is:unread newer_than:1d' } as never)
    )) as { emails: Array<{ id: string; from: string; subject: string }>; count: number }
    expect(client.tools.execute).toHaveBeenCalledTimes(1)
    const [slug, body] = client.tools.execute.mock.calls[0] as unknown as [string, { arguments: Record<string, unknown> }]
    expect(slug).toBe(GMAIL_SEARCH_SLUG)
    expect(body.arguments['query']).toBe('is:unread newer_than:1d')
    expect(body.arguments['max_results']).toBe(GMAIL_MAX_RESULTS)
    expect(out.count).toBe(3)
    // Newest first: bbb (Oct 6) before aaa (Oct 5) before ccc (Sep).
    expect(out.emails.map((e) => e.id)).toEqual(['bbb', 'aaa', 'ccc'])
    expect(out.emails[0]).toMatchObject({ from: 'upstox@example.com', subject: 'Market alert' })
    expect(guard.status().used).toBe(1)
  })

  it('cache hit across runs costs zero', async () => {
    const { provider, guard, client } = providerWith(fakeClient())
    const args = { query: 'from:upstox' } as never
    await runWithContext({ runId: 'r1', source: 'palette' }, () => getTools(provider)['gmail_search']!.execute(args))
    const again = await runWithContext({ runId: 'r2', source: 'palette' }, () => getTools(provider)['gmail_search']!.execute(args))
    expect(client.tools.execute).toHaveBeenCalledTimes(1)
    expect(guard.status().used).toBe(1)
    expect((again as { count: number }).count).toBe(3)
  })

  it('dedupes identical calls within one run', async () => {
    const { provider, guard, client } = providerWith(fakeClient())
    const args = { query: 'x' } as never
    const ctx = { runId: 'same-run', source: 'palette' as const }
    await runWithContext(ctx, () => getTools(provider)['gmail_search']!.execute(args))
    await runWithContext(ctx, () => getTools(provider)['gmail_search']!.execute(args))
    expect(client.tools.execute).toHaveBeenCalledTimes(1)
    expect(guard.status().used).toBe(1)
  })
})

describe('gmail_get and gmail_labels', () => {
  it('fetches one message by id', async () => {
    const { provider, client } = providerWith(fakeClient())
    const out = (await runWithContext({ runId: 'r1', source: 'palette' }, () =>
      getTools(provider)['gmail_get']!.execute({ messageId: 'aaa' } as never)
    )) as { email: { id: string; subject: string } }
    expect(client.tools.execute).toHaveBeenCalledTimes(1)
    const [slug, body] = client.tools.execute.mock.calls[0] as unknown as [string, { arguments: Record<string, unknown> }]
    expect(slug).toBe(GMAIL_GET_SLUG)
    expect(body.arguments['message_id']).toBe('aaa')
    expect(out.email).toMatchObject({ id: 'aaa', subject: 'Offer letter' })
  })

  it('lists labels', async () => {
    const { provider, client } = providerWith(fakeClient())
    const out = (await runWithContext({ runId: 'r1', source: 'palette' }, () =>
      getTools(provider)['gmail_labels']!.execute({} as never)
    )) as { labels: Array<{ id: string }> }
    const [slug] = client.tools.execute.mock.calls[0] as unknown as [string]
    expect(slug).toBe(GMAIL_LABELS_SLUG)
    expect(out.labels).toEqual([{ id: 'INBOX', name: 'INBOX', type: 'system' }])
  })
})

describe('not-connected and no-key paths', () => {
  it('returns a clear message and spends zero budget when Gmail is not connected', async () => {
    const { provider, guard, client } = providerWith(fakeClient({ connected: false }))
    const out = await runWithContext({ runId: 'r1', source: 'palette' }, () =>
      getTools(provider)['gmail_search']!.execute({} as never)
    )
    expect(String(out)).toContain(GMAIL_NOT_CONNECTED)
    expect(String(out)).toMatch(/not connected/i)
    expect(client.tools.execute).not.toHaveBeenCalled()
    expect(guard.status().used).toBe(0)
  })

  it('asks for the Composio key when none is set', async () => {
    const { provider, client } = providerWith(fakeClient(), null)
    const out = await runWithContext({ runId: 'r1', source: 'palette' }, () =>
      getTools(provider)['gmail_search']!.execute({} as never)
    )
    expect(String(out)).toMatch(/composio api key/i)
    expect(client.tools.execute).not.toHaveBeenCalled()
  })
})

describe('status() and connect()', () => {
  it('reports connected with detail', async () => {
    const { provider } = providerWith(fakeClient({ connected: true }))
    const st = await provider.status('gmail')
    expect(st).toMatchObject({ connected: true })
    expect(st.detail).toMatch(/connected/i)
  })

  it('reports not connected', async () => {
    const { provider } = providerWith(fakeClient({ connected: false }))
    const st = await provider.status('gmail')
    expect(st.connected).toBe(false)
  })

  it('connect() returns an auth URL', async () => {
    const { provider, client } = providerWith(fakeClient({ connected: false }))
    const res = await provider.connect('gmail')
    expect(res.ok).toBe(true)
    expect(res.url).toBe('https://composio.example/auth')
    expect(client.connectedAccounts.link).toHaveBeenCalledTimes(1)
  })

  it('connect() short-circuits when already connected', async () => {
    const { provider, client } = providerWith(fakeClient({ connected: true }))
    const res = await provider.connect('gmail')
    expect(res.ok).toBe(true)
    expect(res.url).toBeUndefined()
    expect(client.connectedAccounts.link).not.toHaveBeenCalled()
  })

  it('connect() explains a missing managed auth config', async () => {
    const { provider } = providerWith(fakeClient({ connected: false, authConfigs: [] }))
    const res = await provider.connect('gmail')
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/auth config/i)
  })
})

describe('gmail system prompt', () => {
  it('is included for @gmail runs: newest-first, no invention, untrusted data', () => {
    const instructions = buildInstructions('palette', ['gmail'])
    expect(instructions).toMatch(/newest first/i)
    expect(instructions).toMatch(/never invent/i)
    expect(instructions).toMatch(/untrusted/i)
    expect(GMAIL_SYSTEM_PROMPT).toMatch(/forward all mail/i)
  })

  it('is absent for non-gmail runs', () => {
    expect(buildInstructions('palette', [])).not.toContain(GMAIL_SYSTEM_PROMPT)
  })
})

describe('ToolSet type compat', () => {
  it('provider tools satisfy the ai ToolSet', () => {
    const { provider } = providerWith(fakeClient())
    const tools = provider.getTools(['gmail'])
    expect(tools).toBeTypeOf('object')
    void (tools as ToolSet)
  })
})
