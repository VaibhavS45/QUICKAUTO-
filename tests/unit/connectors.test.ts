import { describe, expect, it } from 'vitest'
import {
  ConnectorSettingsService,
  MemoryConnectorStore,
  type SafeStorageLike
} from '../../src/main/connectors/connector-settings.js'
import { ComposioProvider, createComposioTools } from '../../src/main/connectors/composio-tools.js'
import { createBuiltinTools } from '../../src/main/agent/tools.js'

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
  it('maps @notion/@websearch to tools, ignores unknown', () => {
    const p = new ComposioProvider(async () => 'ak_test')
    expect(Object.keys(p.getTools(['notion']))).toEqual(['notion_search', 'notion_create'])
    expect(Object.keys(p.getTools(['websearch']))).toEqual(['web_search'])
    expect(Object.keys(p.getTools(['notion', 'websearch']))).not.toContain('calendar')
  })

  it('status reflects key presence without leaking it', async () => {
    const off = new ComposioProvider(async () => null)
    expect(await off.status('notion')).toEqual({ connected: false, detail: expect.any(String) })
    const on = new ComposioProvider(async () => 'ak_test')
    const st = await on.status('notion')
    expect(st.connected).toBe(true)
    expect(JSON.stringify(st)).not.toContain('ak_test')
  })

  it('tools throw a connect hint when no key (never silently fail)', async () => {
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
    const tools = createComposioTools(async () => null, { webSearchProvider: fakeProvider }) as unknown as Record<
      string,
      { execute: (args: unknown, opts?: unknown) => Promise<unknown> }
    >
    await expect(tools['notion_search']!.execute({ query: 'x' })).rejects.toThrow(/Not connected/)
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
    const tools = createComposioTools(async () => 'ak_test', { webSearchProvider: fakeProvider }) as unknown as Record<
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
