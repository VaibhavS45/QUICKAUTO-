import { z } from 'zod'
import { SecretVault, MODEL_API_KEY_NAME, COMPOSIO_API_KEY_NAME } from './secret-vault.js'

export { MODEL_API_KEY_NAME, COMPOSIO_API_KEY_NAME }

/**
 * Model/provider settings. Secrets (API key) are encrypted with Electron
 * safeStorage (ASYNC API — sync API is deprecated, removed in Electron 46)
 * and kept only as ciphertext in electron-store. The renderer only ever sees
 * `keySet: yes/no`, never the key itself.
 *
 * This module is storage-agnostic so it can be unit-tested without Electron:
 * pass `store` / `encrypt` / `decrypt`. Production wires electron-store +
 * safeStorage in src/main/index.ts.
 */

export const ModelProviderSchema = z.enum(['anthropic', 'openai', 'openai-compatible'])
export type ModelProvider = z.infer<typeof ModelProviderSchema>

export const ModelSettingsSchema = z.object({
  provider: ModelProviderSchema,
  model: z.string().min(1).max(200),
  baseUrl: z.string().url().max(500).optional().or(z.literal('').transform(() => undefined)),
  /** Budget reset day 1-28. */
  resetDay: z.number().int().min(1).max(28).optional(),
  /**
   * Per-tool auto-approve list. Default OFF (empty). Applies only to
   * non-write tools in palette runs — writes always need the approval card
   * and scheduled runs never auto-approve (see agent/tools.ts).
   */
  autoApprove: z.array(z.string().min(1).max(64)).max(32).optional()
})
export type ModelSettings = z.infer<typeof ModelSettingsSchema>

export interface SettingsStore {
  get(key: string): unknown
  set(key: string, value: unknown): void
}

export class MemorySettingsStore implements SettingsStore {
  private data = new Map<string, unknown>()
  get(key: string): unknown {
    return this.data.get(key)
  }
  set(key: string, value: unknown): void {
    this.data.set(key, value)
  }
}

const SETTINGS_KEY = 'model-settings'
/** Legacy (Prompt 0) model-key slot, migrated into the vault on first read. */
const LEGACY_SECRET_KEY = 'model-api-key-encrypted'

export const DEFAULT_MODEL_SETTINGS: ModelSettings = {
  provider: 'anthropic',
  model: 'claude-sonnet-4-5',
  resetDay: 1
}

export interface SafeStorageLike {
  encryptStringAsync(plainText: string): Promise<Buffer>
  /** Resolves { result, shouldReEncrypt } in real Electron; tests may return a string. */
  decryptStringAsync(encrypted: Buffer): Promise<{ result: string; shouldReEncrypt: boolean } | string>
  isAsyncEncryptionAvailable?: () => Promise<boolean>
}

export class ModelSettingsService {
  private readonly vault: SecretVault

  constructor(
    private readonly store: SettingsStore,
    private readonly safeStorage: SafeStorageLike
  ) {
    this.vault = new SecretVault(store, safeStorage)
  }

  /** Non-secret config (safe to send to the renderer). */
  getConfig(): ModelSettings {
    const raw = this.store.get(SETTINGS_KEY)
    const parsed = ModelSettingsSchema.safeParse(raw)
    if (!parsed.success) return { ...DEFAULT_MODEL_SETTINGS }
    return parsed.data
  }

  setConfig(input: unknown): ModelSettings {
    const parsed = ModelSettingsSchema.safeParse(input)
    if (!parsed.success) throw new Error('Invalid model settings.')
    this.store.set(SETTINGS_KEY, parsed.data)
    return parsed.data
  }

  /** Renderer-safe summary: never includes the key. */
  async getPublicState(): Promise<
    ModelSettings & { keySet: boolean; composioKeySet: boolean; encryptionAvailable: boolean }
  > {
    const config = this.getConfig()
    let encryptionAvailable = true
    try {
      if (this.safeStorage.isAsyncEncryptionAvailable) {
        encryptionAvailable = await this.safeStorage.isAsyncEncryptionAvailable()
      }
    } catch {
      encryptionAvailable = false
    }
    return {
      ...config,
      keySet: await this.vault.hasSecret(MODEL_API_KEY_NAME),
      composioKeySet: await this.vault.hasSecret(COMPOSIO_API_KEY_NAME),
      encryptionAvailable
    }
  }

  async setApiKey(key: string): Promise<void> {
    await this.vault.setSecret(MODEL_API_KEY_NAME, key)
  }

  async clearApiKey(): Promise<void> {
    await this.vault.clearSecret(MODEL_API_KEY_NAME)
  }

  /** Main-process only. NEVER expose over IPC to the renderer. */
  async getApiKey(): Promise<string | null> {
    const current = await this.vault.getSecret(MODEL_API_KEY_NAME)
    if (current) return current
    // One-time migration from the Prompt 0 slot.
    const hex = this.store.get(LEGACY_SECRET_KEY)
    if (typeof hex !== 'string' || hex.length === 0) return null
    const out = await this.safeStorage.decryptStringAsync(Buffer.from(hex, 'hex'))
    const plain = typeof out === 'string' ? out : out.result
    await this.vault.setSecret(MODEL_API_KEY_NAME, plain)
    this.store.set(LEGACY_SECRET_KEY, '')
    return plain
  }
}
