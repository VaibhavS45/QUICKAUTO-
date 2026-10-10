import { describe, expect, it } from 'vitest'
import { ChatStore, type ChatStoreStorage } from '../../src/main/shell/chat-store.js'
import { MAX_HISTORY_MESSAGES, MAX_MESSAGES_PER_THREAD, MAX_THREADS } from '../../src/shared/chat.js'

function memoryStorage(): ChatStoreStorage & { values: Map<string, unknown> } {
  const values = new Map<string, unknown>()
  return {
    values,
    get: (key) => values.get(key),
    set: (key, value) => void values.set(key, value)
  }
}

describe('ChatStore', () => {
  it('auto-titles, caps threads/messages/history, and persists updates', () => {
    let time = 1
    let nextId = 0
    const store = new ChatStore(memoryStorage(), () => time++, () => `thread-${++nextId}`)
    const thread = store.create()
    store.append(thread.id, { role: 'user', text: '  Summarise   my inbox  ', createdAt: 2 })
    expect(store.get(thread.id)?.title).toBe('Summarise my inbox')

    for (let i = 0; i < MAX_MESSAGES_PER_THREAD + 5; i++) {
      store.append(thread.id, { role: 'assistant', text: `reply-${i}`, createdAt: time++ })
    }
    expect(store.get(thread.id)?.messages).toHaveLength(MAX_MESSAGES_PER_THREAD)
    expect(store.get(thread.id)?.messages[0]?.text).toBe('reply-5')
    expect(store.historyFor(thread.id)).toHaveLength(MAX_HISTORY_MESSAGES)

    for (let i = 0; i < MAX_THREADS + 5; i++) store.create()
    expect(store.list()).toHaveLength(MAX_THREADS)
    expect(store.get(thread.id)).toBeNull()
  })

  it('renames, deletes, and clears threads', () => {
    const store = new ChatStore(memoryStorage(), () => 1, (() => {
      let id = 0
      return () => `thread-${++id}`
    })())
    const first = store.create()
    const second = store.create()
    expect(store.rename(first.id, '  Inbox  ')).toBe(true)
    expect(store.get(first.id)?.title).toBe('Inbox')
    expect(store.rename(first.id, '  ')).toBe(false)
    expect(store.remove(second.id)).toBe(true)
    expect(store.remove(second.id)).toBe(false)
    expect(store.clear()).toBe(1)
    expect(store.list()).toEqual([])
  })

  it('drops corrupt records and prunes expired threads', () => {
    const storage = memoryStorage()
    const store = new ChatStore(storage, () => 40 * 86_400_000, () => 'valid')
    storage.set('chat-threads', [{ id: 'bad', junk: true }, 7])
    expect(store.list()).toEqual([])

    const recent = store.create()
    const old = { ...recent, id: 'old', createdAt: 1, updatedAt: 1 }
    storage.set('chat-threads', [recent, old])
    expect(store.prune(30)).toBe(1)
    expect(store.list().map((thread) => thread.id)).toEqual(['valid'])
  })
})
