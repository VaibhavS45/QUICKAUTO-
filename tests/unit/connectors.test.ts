import { describe, expect, it, vi } from 'vitest'
import {
  ConnectorSettingsService,
  MemoryConnectorStore,
  type SafeStorageLike
} from '../../src/main/settings/connector-settings.js'
import { ComposioProvider, createComposioTools, isComposioBudgetGuardedTool } from '../../src/main/engines/composio/composio-tools.js'
import { BudgetGuard } from '../../src/main/engines/composio/budget-guard.js'
import { APPROVAL_REQUIRED_TOOLS, buildToolApproval, createBuiltinTools } from '../../src/main/agent/tools.js'

const getGuard = (): BudgetGuard => new BudgetGuard()

function fakeSafeStorage(): SafeStorageLike {
  return {
    async encryptStringAsync(plain: string) {
      return Buffer.from(`enc:${plain.split('').reverse().join('')}`)
    },
    async decryptStringAsync(enc: Buffer) {
      const s = enc.toString().replace(/^enc:/, '')
      return { result: s.split('').reverse().join(''), shouldReEncrypt: false }
    }
  }
}

describe('ConnectorSettingsService', () => {
  it('renderer only sees flags, never the key; nothing in plaintext', async () => {
    const store = new MemoryConnectorStore()
    const svc = new ConnectorSettingsService(store, fakeSafeStorage())
    await svc.setKey('ak_test_123456')
    const pub = await svc.getPublicState()
    expect(pub.configured).toBe(true)
    expect(JSON.stringify(pub)).not.toContain('ak_test_123456')
    const atRest = store.get('composio-project-key-encrypted')
    expect(String(atRest)).not.toContain('ak_test_123456')
    expect(await svc.getKey()).toBe('ak_test_123456')
  })

  it('rejects non-ak_ keys and clears cleanly', async () => {
    const svc = new ConnectorSettingsService(new MemoryConnectorStore(), fakeSafeStorage())
    await expect(svc.setKey('sk-nope')).rejects.toThrow(/ak_/)
    await svc.setKey('ak_test_123456')
    await svc.clearKey()
    expect(await svc.getKey()).toBeNull()
    expect((await svc.getPublicState()).configured).toBe(false)
  })
})

describe('ComposioProvider', () => {
  it('maps connected Composio app requests to generic tools and preserves web search', async () => {
    const p = new ComposioProvider(async () => 'ak_test', getGuard, () => ({
      sessions: {
        create: async () => ({
          toolkits: async () => ({ items: [{ slug: 'notion', name: 'Notion' }] }),
          search: async () => ({ results: [] }),
          execute: async () => ({ data: {} })
        })
      }
    }))
    expect(Object.keys(await p.getTools(['notion']))).toEqual(['composio_search', 'composio_execute'])
    expect(Object.keys(await p.getTools(['websearch']))).toEqual(['web_search'])
    expect(Object.keys(await p.getTools(['notion', 'websearch']))).toEqual([
      'web_search',
      'composio_search',
      'composio_execute'
    ])
  })

  it('status reflects key presence without leaking it', async () => {
    const off = new ComposioProvider(async () => null, getGuard)
    expect(await off.status('notion')).toEqual({ connected: false, detail: expect.any(String) })
    const on = new ComposioProvider(async () => 'ak_test', getGuard)
    const st = await on.status('notion')
    expect(st.connected).toBe(true)
    expect(JSON.stringify(st)).not.toContain('ak_test')
  })

  it('requires an approval card for every generic Composio action', () => {
    expect(APPROVAL_REQUIRED_TOOLS.has('composio_execute')).toBe(true)
    expect(buildToolApproval('chat', ['composio_execute'])['composio_execute']).toBe('user-approval')
    expect(buildToolApproval('scheduled', ['composio_execute'])['composio_execute']).toMatchObject({ type: 'denied' })
  })

  it('meters tool search and execution with BudgetGuard', async () => {
    const guard = new BudgetGuard()
    const executeGuarded = vi.spyOn(guard, 'execute')
    const provider = new ComposioProvider(async () => 'ak_test', () => guard, () => ({
      sessions: {
        create: async () => ({
          toolkits: async () => ({ items: [{ slug: 'gmail', name: 'Gmail' }] }),
          search: async () => ({ results: [{ primaryToolSlugs: ['GMAIL_GET_MESSAGE'], relatedToolSlugs: [] }] }),
          execute: async () => ({ data: { message: 'Hello' } })
        })
      }
    }))
    const tools = await provider.getTools(['composio']) as unknown as Record<
      string,
      { execute: (args: unknown) => Promise<unknown> }
    >
    expect(isComposioBudgetGuardedTool(tools['composio_search'])).toBe(true)
    expect(isComposioBudgetGuardedTool(tools['composio_execute'])).toBe(true)
    await tools['composio_search']!.execute({ query: 'find email' })
    await tools['composio_execute']!.execute({ toolSlug: 'GMAIL_GET_MESSAGE', arguments: {} })
    expect(executeGuarded).toHaveBeenCalledTimes(2)
    expect(executeGuarded).toHaveBeenNthCalledWith(1, expect.objectContaining({ label: 'composio_search' }))
    expect(executeGuarded).toHaveBeenNthCalledWith(2, expect.objectContaining({ label: 'composio_execute:GMAIL_GET_MESSAGE' }))
  })

  it('requires a key for Composio app tools and keeps web search available', async () => {
    const fakeProvider = {
      name: 'fake-search',
      search: async (query: string) => ({
        query,
        provider: 'fake-search',
        answer: 'The answer is 42.',
        results: [{ title: 'Result', url: 'https://example.com', snippet: 'Example snippet' }],
        sources: [{ title: 'Result', url: 'https://example.com' }],
        searchedAt: '2026-10-08T00:00:00.000Z'
      })
    }
    const provider = new ComposioProvider(async () => null, getGuard)
    await expect(provider.getTools(['notion'])).rejects.toThrow(/Not connected/)
    const tools = createComposioTools({ webSearchProvider: fakeProvider }) as unknown as Record<
      string,
      { execute: (args: unknown, opts?: unknown) => Promise<unknown> }
    >
    await expect(tools['web_search']!.execute({ query: 'x' })).resolves.toMatchObject({ provider: 'fake-search' })
  })

  it('web_search uses a replaceable provider and keeps sources', async () => {
    const fakeProvider = {
      name: 'fake-search',
      search: async (query: string) => ({
        query,
        provider: 'fake-search',
        answer: 'The answer is 42.',
        results: [
          { title: 'Example 1', url: 'https://example.com/1', snippet: 'A factual source about the answer.' },
          { title: 'Example 2', url: 'https://example.com/2', snippet: 'Second source with context.' }
        ],
        sources: [{ title: 'Example 1', url: 'https://example.com/1' }, { title: 'Example 2', url: 'https://example.com/2' }],
        searchedAt: '2026-10-08T00:00:00.000Z'
      })
    }
    const tools = createComposioTools({ webSearchProvider: fakeProvider }) as unknown as Record<
      string,
      { execute: (args: unknown, opts?: unknown) => Promise<unknown> }
    >
    const result = await tools['web_search']!.execute({ query: 'answer to life', maxResults: 2 })
    expect(result).toMatchObject({ provider: 'fake-search', answer: 'The answer is 42.' })
    expect((result as { sources: Array<{ url: string }> }).sources).toHaveLength(2)
  })
})

describe('Builtin files tool', () => {
  it('writes inside approved directories and blocks others', async () => {
    const tools = createBuiltinTools() as unknown as Record<string, { execute: (args: unknown) => Promise<unknown> }>
    const target = '/tmp/app-websearch-test.txt'
    await expect(
      tools.write_file.execute({ path: target, content: 'hello world' })
    ).resolves.toMatchObject({ ok: true, path: target })
    await expect(
      tools.write_file.execute({ path: '/etc/passwd', content: 'nope' })
    ).rejects.toThrow(/Only files inside your home directory/)
  })
})
