import { z } from 'zod'

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
  resetDay: z.number().int().min(1).max(28).optional()
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
const SECRET_KEY = 'model-api-key-encrypted'

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
  constructor(
    private readonly store: SettingsStore,
    private readonly safeStorage: SafeStorageLike
  ) {}

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
  async getPublicState(): Promise<ModelSettings & { keySet: boolean; encryptionAvailable: boolean }> {
    const config = this.getConfig()
    const encrypted = this.store.get(SECRET_KEY)
    let encryptionAvailable = true
    try {
      if (this.safeStorage.isAsyncEncryptionAvailable) {
        encryptionAvailable = await this.safeStorage.isAsyncEncryptionAvailable()
      }
    } catch {
      encryptionAvailable = false
    }
    return { ...config, keySet: typeof encrypted === 'string' && encrypted.length > 0, encryptionAvailable }
  }

  async setApiKey(key: string): Promise<void> {
    const trimmed = key.trim()
    if (!trimmed) throw new Error('API key must not be empty.')
    if (trimmed.length > 10000) throw new Error('API key is too long.')
    const encrypted = await this.safeStorage.encryptStringAsync(trimmed)
    this.store.set(SECRET_KEY, encrypted.toString('hex'))
  }

  async clearApiKey(): Promise<void> {
    this.store.set(SECRET_KEY, '')
  }

  /** Main-process only. NEVER expose over IPC to the renderer. */
  async getApiKey(): Promise<string | null> {
    const hex = this.store.get(SECRET_KEY)
    if (typeof hex !== 'string' || hex.length === 0) return null
    const out = await this.safeStorage.decryptStringAsync(Buffer.from(hex, 'hex'))
    return typeof out === 'string' ? out : out.result
  }
}
