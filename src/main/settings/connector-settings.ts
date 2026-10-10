/** Connector credentials (OpenMausBot-style: keys once, write-only flags).
 * Only the Composio project key (`ak_…`) is stored. The renderer only ever
 * sees `configured: true/false`, never the key. Ciphertext lives in
 * electron-store; encryption is Electron safeStorage async API (wired in
 * src/main/index.ts, faked in tests). */

const SECRET_KEY = "composio-project-key-encrypted";

export interface ConnectorStore {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
}

export class MemoryConnectorStore implements ConnectorStore {
  private data = new Map<string, unknown>();
  get(key: string): unknown {
    return this.data.get(key);
  }
  set(key: string, value: unknown): void {
    this.data.set(key, value);
  }
}

export interface SafeStorageLike {
  encryptStringAsync(plainText: string): Promise<Buffer>;
  decryptStringAsync(
    encrypted: Buffer,
  ): Promise<{ result: string; shouldReEncrypt: boolean } | string>;
  isAsyncEncryptionAvailable?: () => Promise<boolean>;
}

export class ConnectorSettingsService {
  constructor(
    private readonly store: ConnectorStore,
    private readonly safeStorage: SafeStorageLike,
  ) {}

  /** Renderer-safe summary: never includes the key. */
  async getPublicState(): Promise<{
    configured: boolean;
    encryptionAvailable: boolean;
  }> {
    const encrypted = this.store.get(SECRET_KEY);
    let encryptionAvailable = true;
    try {
      if (this.safeStorage.isAsyncEncryptionAvailable) {
        encryptionAvailable =
          await this.safeStorage.isAsyncEncryptionAvailable();
      }
    } catch {
      encryptionAvailable = false;
    }
    return {
      configured: typeof encrypted === "string" && encrypted.length > 0,
      encryptionAvailable,
    };
  }

  async setKey(key: string): Promise<void> {
    const trimmed = key.trim();
    if (
      !trimmed.startsWith("ak_") ||
      trimmed.length < 10 ||
      trimmed.length > 10000
    ) {
      throw new Error(
        'Composio project key must start with "ak_". Copy it from the Composio dashboard (project Settings → API Keys).',
      );
    }
    const encrypted = await this.safeStorage.encryptStringAsync(trimmed);
    this.store.set(SECRET_KEY, encrypted.toString("hex"));
  }

  async clearKey(): Promise<void> {
    this.store.set(SECRET_KEY, "");
  }

  /** Main-process only. NEVER expose over IPC to the renderer. */
  async getKey(): Promise<string | null> {
    const hex = this.store.get(SECRET_KEY);
    if (typeof hex !== "string" || hex.length === 0) return null;
    const out = await this.safeStorage.decryptStringAsync(
      Buffer.from(hex, "hex"),
    );
    return typeof out === "string" ? out : out.result;
  }
}
