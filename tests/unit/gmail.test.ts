import { describe, expect, it } from 'vitest'
import { BudgetGuard, MemoryBudgetStore } from '../../src/main/connectors/budget-guard.js'
import {
  COMPOSIO_USER_ID,
  ComposioConnectorProvider,
  GMAIL_GET_SLUG,
  GMAIL_LABELS_SLUG,
  GMAIL_MAX_RESULTS,
  GMAIL_READ_TOOLS,
  GMAIL_SEARCH_SLUG,
  GMAIL_WRITE_TOOLS,
  isPaletteGuarded,
  type ComposioClientLike
} from '../../src/main/connectors/composio.js'
import { runWithContext } from '../../src/main/agent/run-context.js'

interface ExecCall {
  slug: string
  body: Record<string, unknown>
}

function fakeClient(opts: {
  connected?: boolean
  authConfigId?: string | null
  linkUrl?: string | null
  execute?: (slug: string, body: Record<string, unknown>) => Promise<{ data?: unknown; error?: string | null; successful?: boolean }>
  onExecute?: (slug: string, body: Record<string, unknown>) => void
} = {}): { client: ComposioClientLike; calls: ExecCall[] } {
  const calls: ExecCall[] = []
  const client = {
    tools: {
      execute: async (slug: string, body: Record<string, unknown>) => {
        calls.push({ slug, body })
        opts.onExecute?.(slug, body)
        if (opts.execute) return opts.execute(slug, body)
        return { data: { messages: [] }, error: null, successful: true }
      }
    },
    connectedAccounts: {
      list: async () => ({ items: opts.connected === false ? [] : [{ id: 'conn-1', status: 'ACTIVE' }] }),
      link: async () => ({ redirectUrl: opts.linkUrl === null ? undefined : (opts.linkUrl ?? 'https://composio.example/auth') })
    },
    authConfigs: {
      list: async () => ({ items: opts.authConfigId === null ? [] : [{ id: opts.authConfigId ?? 'auth-1' }] })
    }
  } as unknown as ComposioClientLike
  return { client, calls }
}

function providerWith(
  fake: { client: ComposioClientLike; calls: ExecCall[] },
  opts: { key?: string | null; guard?: BudgetGuard } = {}
): { provider: ComposioConnectorProvider; guard: BudgetGuard } {
  const guard = opts.guard ?? new BudgetGuard({ store: new MemoryBudgetStore() })
  const provider = new ComposioConnectorProvider({
    getApiKey: async () => (opts.key === undefined ? 'test-composio-key' : opts.key),
    getGuard: () => guard,
    createClient: () => fake.client
  })
  return { provider, guard }
}

async function searchEmails(provider: ComposioConnectorProvider, input: Record<string, unknown> = {}): Promise<unknown> {
  const tools = provider.getTools(['gmail']) as unknown as Record<
    string,
    { execute: (input: Record<string, unknown>) => Promise<unknown> }
  >
  return runWithContext({ runId: 'test-run', source: 'palette' }, () => tools['gmail_search']!.execute(input))
}

describe('gmail read-only tools', () => {
  it('exposes exactly the read tools plus the four approval-gated writes', () => {
    const fake = fakeClient()
    const { provider } = providerWith(fake)
    const names = Object.keys(provider.getTools(['gmail']))
    expect(names.sort()).toEqual([...GMAIL_READ_TOOLS, ...GMAIL_WRITE_TOOLS].sort())
    expect(names.some((n) => /delete|trash|forward|filter|batch/i.test(n))).toBe(false)
  })

  it('returns nothing for other mentions', () => {
    const fake = fakeClient()
    const { provider } = providerWith(fake)
    expect(provider.getTools(['notion'])).toEqual({})
    expect(provider.getTools([])).toEqual({})
  })

  it('marks its tools so the generic BudgetGuard wrapper skips them (one hit per call)', () => {
    const fake = fakeClient()
    const { provider } = providerWith(fake)
    for (const t of Object.values(provider.getTools(['gmail']))) {
      expect(isPaletteGuarded(t)).toBe(true)
    }
    expect(isPaletteGuarded({})).toBe(false)
  })
})

describe('gmail search', () => {
  it('hits BudgetGuard once per call with max page size in one call', async () => {
    const fake = fakeClient({
      execute: async () => ({
        data: {
          messages: [
            { messageId: 'old', subject: 'Old', sender: 'a@x.com', internalDate: '2020-01-01' },
            { messageId: 'new', subject: 'New', sender: 'b@x.com', internalDate: '2026-10-01' }
          ]
        },
        error: null,
        successful: true
      })
    })
    const { provider, guard } = providerWith(fake)
    const out = (await searchEmails(provider, { query: 'is:unread newer_than:1d' })) as {
      emails: Array<{ id: string; from: string; subject: string }>
      count: number
    }
    expect(fake.calls).toHaveLength(1)
    expect(fake.calls[0]!.slug).toBe(GMAIL_SEARCH_SLUG)
    expect(fake.calls[0]!.body).toMatchObject({ userId: COMPOSIO_USER_ID, version: expect.any(String) })
    expect((fake.calls[0]!.body['arguments'] as Record<string, unknown>)['max_results']).toBe(GMAIL_MAX_RESULTS)
    expect((fake.calls[0]!.body['arguments'] as Record<string, unknown>)['query']).toBe('is:unread newer_than:1d')
    // Newest first, compact sender/subject summaries.
    expect(out.count).toBe(2)
    expect(out.emails[0]).toMatchObject({ id: 'new', from: 'b@x.com', subject: 'New' })
    expect(guard.status().used).toBe(1)
  })

  it('cache hit costs zero', async () => {
    const fake = fakeClient()
    const { provider, guard } = providerWith(fake)
    await searchEmails(provider, { query: 'from:upstox' })
    await searchEmails(provider, { query: 'from:upstox' })
    expect(fake.calls).toHaveLength(1)
    expect(guard.status().used).toBe(1)
  })

  it('dedupe hits cost zero after the cache is cleared mid-run', async () => {
    const fake = fakeClient()
    const { provider, guard } = providerWith(fake)
    await searchEmails(provider, {})
    guard.clearCache()
    await searchEmails(provider, {})
    expect(fake.calls).toHaveLength(1)
    expect(guard.status().used).toBe(1)
  })

  it('falls back past toolkit version bumps', async () => {
    let first = true
    const fake = fakeClient({
      execute: async (_slug, body) => {
        if (first) {
          first = false
          throw new Error('ComposioToolVersionRequiredError: version 20260915_00 not found')
        }
        expect(body['dangerouslySkipVersionCheck']).toBe(true)
        return { data: { messages: [] }, error: null, successful: true }
      }
    })
    const { provider } = providerWith(fake)
    const out = (await searchEmails(provider, {})) as { count: number }
    expect(out.count).toBe(0)
    expect(fake.calls).toHaveLength(2)
  })

  it('get one email and list labels use fixed slugs', async () => {
    const fake = fakeClient({
      execute: async (slug) => {
        if (slug === GMAIL_GET_SLUG) return { data: { message: { id: 'abc', subject: 'Hi' } }, error: null, successful: true }
        return { data: { labels: [{ id: 'INBOX', name: 'Inbox', type: 'system' }] }, error: null, successful: true }
      }
    })
    const { provider } = providerWith(fake)
    const tools = provider.getTools(['gmail']) as unknown as Record<string, { execute: (i: never) => Promise<unknown> }>
    const email = (await runWithContext({ runId: 'r1', source: 'palette' }, () =>
      tools['gmail_get']!.execute({ messageId: 'abc' } as never))) as { email: { id: string } }
    const labels = (await runWithContext({ runId: 'r1', source: 'palette' }, () =>
      tools['gmail_labels']!.execute({} as never))) as { labels: Array<{ id: string }> }
    expect(email.email.id).toBe('abc')
    expect(labels.labels).toEqual([{ id: 'INBOX', name: 'Inbox', type: 'system' }])
    expect(fake.calls.map((c) => c.slug).sort()).toEqual([GMAIL_GET_SLUG, GMAIL_LABELS_SLUG].sort())
  })
})

describe('gmail not-connected paths', () => {
  it('no Composio key: clear message, no client call, guard untouched', async () => {
    const fake = fakeClient()
    const { provider, guard } = providerWith(fake, { key: null })
    const out = await searchEmails(provider, {})
    expect(String(out)).toMatch(/composio api key is not set/i)
    expect(String(out)).toMatch(/GMAIL_NOT_CONNECTED/)
    expect(fake.calls).toHaveLength(0)
    expect(guard.status().used).toBe(0)
  })

  it('no Gmail connection: clear message with connect guidance, guard untouched', async () => {
    const fake = fakeClient({ connected: false })
    const { provider, guard } = providerWith(fake)
    const out = await searchEmails(provider, {})
    expect(String(out)).toMatch(/not connected/i)
    expect(String(out)).toMatch(/Connect Gmail/)
    expect(fake.calls).toHaveLength(0)
    expect(guard.status().used).toBe(0)
  })

  it('status reports key and connection state without spending budget', async () => {
    const noKey = providerWith(fakeClient(), { key: null }).provider
    expect(await noKey.status('gmail')).toMatchObject({ connected: false })
    const off = providerWith(fakeClient({ connected: false })).provider
    expect(await off.status('gmail')).toMatchObject({ connected: false })
    const on = providerWith(fakeClient({ connected: true })).provider
    expect(await on.status('gmail')).toMatchObject({ connected: true })
  })

  it('connect opens the auth link; already-connected short-circuits', async () => {
    const linkCalls: string[] = []
    const fake = fakeClient({ onExecute: () => {} })
    const withLink = new ComposioConnectorProvider({
      getApiKey: async () => 'k',
      getGuard: () => new BudgetGuard({ store: new MemoryBudgetStore() }),
      createClient: () => ({
        ...fake.client,
        connectedAccounts: {
          list: async () => ({ items: [] }),
          link: async (userId: string, authConfigId: string) => {
            linkCalls.push(`${userId}/${authConfigId}`)
            return { redirectUrl: 'https://composio.example/auth' }
          }
        }
      } as unknown as ComposioClientLike)
    })
    const res = await withLink.connect('gmail')
    expect(res).toEqual({ ok: true, url: 'https://composio.example/auth' })
    expect(linkCalls).toEqual([`${COMPOSIO_USER_ID}/auth-1`])

    const already = providerWith(fakeClient({ connected: true })).provider
    expect(await already.connect('gmail')).toEqual({ ok: true })

    const noKey = providerWith(fakeClient(), { key: null }).provider
    expect((await noKey.connect('gmail')).ok).toBe(false)
  })
})

describe('gmail system prompt guardrails', () => {
  it('never invents emails on failure', async () => {
    const fake = fakeClient({
      execute: async () => ({ data: null, error: 'mailbox unavailable', successful: false })
    })
    const { provider } = providerWith(fake)
    const out = await searchEmails(provider, {})
    expect(String(out)).toMatch(/failed/i)
  })
})
