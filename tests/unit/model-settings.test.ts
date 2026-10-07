import { describe, expect, it } from 'vitest'
import {
  ModelSettingsService,
  MemorySettingsStore,
  type SafeStorageLike
} from '../../src/main/settings/model-settings.js'

function fakeSafeStorage(): SafeStorageLike & { lastPlain: string | null } {
  const box: { lastPlain: string | null } = { lastPlain: null }
  return {
    lastPlain: null,
    async encryptStringAsync(plain: string) {
      box.lastPlain = plain
      // Toy "encryption": tests only check at-rest form != plaintext.
      return Buffer.from(`enc:${plain.split('').reverse().join('')}`)
    },
    async decryptStringAsync(enc: Buffer) {
      const s = enc.toString().replace(/^enc:/, '')
      return { result: s.split('').reverse().join(''), shouldReEncrypt: false }
    }
  }
}

describe('ModelSettingsService', () => {
  it('stores config without secrets; renderer only sees keySet', async () => {
    const store = new MemorySettingsStore()
    const svc = new ModelSettingsService(store, fakeSafeStorage())
    svc.setConfig({ provider: 'openai', model: 'gpt-4o', resetDay: 15 })
    await svc.setApiKey('sk-secret-123')
    const pub = await svc.getPublicState()
    expect(pub.provider).toBe('openai')
    expect(pub.keySet).toBe(true)
    expect(JSON.stringify(pub)).not.toContain('sk-secret-123')
  })

  it('never persists the key in plaintext', async () => {
    const store = new MemorySettingsStore()
    const svc = new ModelSettingsService(store, fakeSafeStorage())
    await svc.setApiKey('sk-secret-123')
    const atRest = store.get('secret:model-api-key:encrypted')
    expect(typeof atRest).toBe('string')
    expect(atRest as string).not.toContain('sk-secret-123')
    expect(await svc.getApiKey()).toBe('sk-secret-123')
  })

  it('clearApiKey removes access; getApiKey returns null', async () => {
    const store = new MemorySettingsStore()
    const svc = new ModelSettingsService(store, fakeSafeStorage())
    await svc.setApiKey('x')
    await svc.clearApiKey()
    expect(await svc.getApiKey()).toBeNull()
    expect((await svc.getPublicState()).keySet).toBe(false)
  })

  it('rejects invalid config and empty keys', async () => {
    const store = new MemorySettingsStore()
    const svc = new ModelSettingsService(store, fakeSafeStorage())
    expect(() => svc.setConfig({ provider: 'nope', model: 'm' })).toThrow()
    await expect(svc.setApiKey('   ')).rejects.toThrow()
  })

  it('falls back to defaults on corrupt stored config', async () => {
    const store = new MemorySettingsStore()
    store.set('model-settings', { provider: '???' })
    const svc = new ModelSettingsService(store, fakeSafeStorage())
    expect(svc.getConfig().provider).toBe('anthropic')
  })

  it('migrates a Prompt-0 legacy key into the vault', async () => {
    const store = new MemorySettingsStore()
    const safe = fakeSafeStorage()
    // Legacy slot holds safeStorage-encrypted hex, as Prompt 0 wrote it.
    const encrypted = await safe.encryptStringAsync('legacy-key')
    store.set('model-api-key-encrypted', encrypted.toString('hex'))
    const svc = new ModelSettingsService(store, safe)
    expect(await svc.getApiKey()).toBe('legacy-key')
    // Migrated: vault slot now holds it, legacy slot cleared.
    expect(store.get('model-api-key-encrypted')).toBe('')
    expect(await svc.getApiKey()).toBe('legacy-key')
  })
})
