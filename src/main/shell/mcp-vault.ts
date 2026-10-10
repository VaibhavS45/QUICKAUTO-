import type { SecretVault } from './mcp-registry.js'

export interface EncryptedSecretStore {
  get(key: string): unknown
  set(key: string, value: unknown): void
}

export interface AsyncSafeStorage {
  encryptStringAsync(value: string): Promise<Buffer>
  decryptStringAsync(value: Buffer): Promise<{ result: string; shouldReEncrypt: boolean } | string>
}

export class SafeStorageMcpVault implements SecretVault {
  constructor(
    private readonly store: EncryptedSecretStore,
    private readonly safeStorage: AsyncSafeStorage
  ) {}

  async set(key: string, value: string): Promise<void> {
    const encrypted = await this.safeStorage.encryptStringAsync(value)
    this.store.set(key, encrypted.toString('hex'))
  }

  async get(key: string): Promise<string | null> {
    const value = this.store.get(key)
    if (typeof value !== 'string' || !value) return null
    const decrypted = await this.safeStorage.decryptStringAsync(Buffer.from(value, 'hex'))
    return typeof decrypted === 'string' ? decrypted : decrypted.result
  }

  async delete(key: string): Promise<void> {
    this.store.set(key, '')
  }
}
