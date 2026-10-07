import type { SettingsStore, SafeStorageLike } from './model-settings.js'

/**
 * Named-secret vault. Every secret is encrypted with Electron safeStorage
 * (async API) and kept only as ciphertext hex in the store. Callers address
 * secrets by name ('model-api-key', 'composio-api-key', ...); the renderer
 * only ever learns has/clear, never values.
 */

const NAME_RE = /^[a-z0-9][a-z0-9-]{0,63}$/

/** Well-known secret names. */
export const MODEL_API_KEY_NAME = 'model-api-key'
export const COMPOSIO_API_KEY_NAME = 'composio-api-key'

export class SecretVault {
  constructor(
    private readonly store: SettingsStore,
    private readonly safeStorage: SafeStorageLike
  ) {}

  private slot(name: string): string {
    if (!NAME_RE.test(name)) throw new Error(`Invalid secret name: ${name}`)
    return `secret:${name}:encrypted`
  }

  async setSecret(name: string, value: string): Promise<void> {
    const trimmed = value.trim()
    if (!trimmed) throw new Error('Secret must not be empty.')
    if (trimmed.length > 10000) throw new Error('Secret is too long.')
    const encrypted = await this.safeStorage.encryptStringAsync(trimmed)
    this.store.set(this.slot(name), encrypted.toString('hex'))
  }

  /** Main-process only. NEVER expose over IPC to the renderer. */
  async getSecret(name: string): Promise<string | null> {
    const hex = this.store.get(this.slot(name))
    if (typeof hex !== 'string' || hex.length === 0) return null
    const out = await this.safeStorage.decryptStringAsync(Buffer.from(hex, 'hex'))
    return typeof out === 'string' ? out : out.result
  }

  async hasSecret(name: string): Promise<boolean> {
    const hex = this.store.get(this.slot(name))
    return typeof hex === 'string' && hex.length > 0
  }

  async clearSecret(name: string): Promise<void> {
    this.store.set(this.slot(name), '')
  }
}
