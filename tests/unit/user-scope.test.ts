import { describe, expect, it } from 'vitest'
import { ScopedJsonStore, ScopedKeyValueStore, scopeFor } from '../../src/main/shell/user-scope.js'

function memoryStore(): { values: Map<string, unknown>; get(key: string): unknown; set(key: string, value: unknown): void } {
  const values = new Map<string, unknown>()
  return {
    values,
    get: (key) => values.get(key),
    set: (key, value) => void values.set(key, value)
  }
}

describe('scopeFor', () => {
  it('is stable, case-insensitive and distinct per account', () => {
    expect(scopeFor(' A@Example.com ')).toBe(scopeFor('a@example.com'))
    expect(scopeFor('a@example.com')).not.toBe(scopeFor('b@example.com'))
    expect(scopeFor()).toBe('local')
  })
})

describe('ScopedKeyValueStore', () => {
  it('keeps each account apart and does not hand old data to the next account', () => {
    const store = memoryStore()
    let scope: string | undefined
    const kv = new ScopedKeyValueStore(store, () => scope)

    // Signed out: the pre-account keys keep working exactly as before.
    kv.set('chat-threads', ['signed-out'])
    expect(store.values.get('chat-threads')).toEqual(['signed-out'])

    // First account to read adopts the old rows, once.
    scope = scopeFor('a@example.com')
    expect(kv.get('chat-threads')).toEqual(['signed-out'])
    kv.set('chat-threads', ['a'])

    scope = scopeFor('b@example.com')
    expect(kv.get('chat-threads')).toBeUndefined()
    kv.set('chat-threads', ['b'])

    scope = scopeFor('a@example.com')
    expect(kv.get('chat-threads')).toEqual(['a'])
  })

  it('feeds the one-key history stores (runs, logs, notifications)', () => {
    const kv = new ScopedKeyValueStore(memoryStore(), () => 'x')
    const runs = new ScopedJsonStore<string[]>(kv, 'recent-runs')
    expect(runs.load()).toBeUndefined()
    runs.save(['r1'])
    expect(runs.load()).toEqual(['r1'])
  })
})
