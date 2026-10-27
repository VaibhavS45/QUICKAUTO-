import { createHash } from 'node:crypto'

/**
 * Per-account storage namespaces. Every account keeps its own chats,
 * automations and run history inside the same electron-store files by
 * suffixing each key with its scope.
 */

export interface KeyValueStore {
  get(key: string): unknown
  set(key: string, value: unknown): void
}

/** Stable, short namespace for an account ('local' when it has no email). */
export function scopeFor(email?: string): string {
  const id = email?.trim().toLowerCase()
  return id ? createHash('sha256').update(id).digest('hex').slice(0, 16) : 'local'
}

/**
 * `scope()` returning undefined means "no account yet": keys stay exactly as
 * they were before accounts existed, which is where the old data lives. Once
 * an account is active, reads/writes go to `key:u:<scope>`; the first account
 * to read adopts the old unscoped rows, once.
 */
export class ScopedKeyValueStore implements KeyValueStore {
  constructor(
    private readonly store: KeyValueStore,
    private readonly scope: () => string | undefined
  ) {}

  get(key: string): unknown {
    const scope = this.scope()
    if (!scope) return this.store.get(key)
    const scoped = this.name(key, scope)
    const value = this.store.get(scoped)
    if (value !== undefined) return value
    const legacy = this.store.get(key)
    if (legacy === undefined) return undefined
    const adopted = `user-scope:adopted:${key}`
    if (this.store.get(adopted) !== undefined) return undefined
    this.store.set(adopted, scope)
    this.store.set(scoped, legacy)
    return legacy
  }

  set(key: string, value: unknown): void {
    const scope = this.scope()
    this.store.set(scope ? this.name(key, scope) : key, value)
  }

  private name(key: string, scope: string): string {
    return `${key}:u:${scope}`
  }
}

/** One-key `load()`/`save()` view (the shape every history store in the app uses). */
export class ScopedJsonStore<T> {
  constructor(
    private readonly kv: KeyValueStore,
    private readonly key: string
  ) {}

  load(): unknown {
    return this.kv.get(this.key)
  }

  save(value: T): void {
    this.kv.set(this.key, value)
  }
}
