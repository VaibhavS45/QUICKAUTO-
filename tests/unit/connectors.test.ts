import { describe, expect, it } from 'vitest'
import {
  ConnectorSettingsService,
  MemoryConnectorStore,
  type SafeStorageLike
} from '../../src/main/connectors/connector-settings.js'
import { ComposioProvider, createComposioTools } from '../../src/main/connectors/composio-tools.js'

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
    expect(Object.keys(p.getTools(['calendar']))).toEqual([])
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
    const tools = createComposioTools(async () => null) as unknown as Record<
      string,
      { execute: (args: unknown, opts?: unknown) => Promise<never> }
    >
    await expect(tools['notion_search']!.execute({ query: 'x' })).rejects.toThrow(/Not connected/)
    await expect(tools['web_search']!.execute({ query: 'x' })).rejects.toThrow(/Not connected/)
  })
})
