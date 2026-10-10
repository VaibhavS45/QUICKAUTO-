import { describe, expect, it } from 'vitest'
import { registerChatIpc, type ChatIpcRegistrar } from '../../src/main/shell/chat-ipc.js'
import { ChatStore } from '../../src/main/shell/chat-store.js'

describe('chat IPC', () => {
  it('registers namespaced handlers and validates every mutation payload', async () => {
    const handlers = new Map<string, (_event: unknown, payload?: unknown) => unknown>()
    const ipc: ChatIpcRegistrar = {
      handle: (channel, listener) => {
        handlers.set(channel, listener)
      }
    }
    const storage = new Map<string, unknown>()
    const chats = new ChatStore({
      get: (key) => storage.get(key),
      set: (key, value) => void storage.set(key, value)
    }, () => 1, () => 'thread-1')
    registerChatIpc(ipc, chats)

    expect([...handlers.keys()]).toEqual([
      'shell:chat-list',
      'shell:chat-get',
      'shell:chat-create',
      'shell:chat-append',
      'shell:chat-rename',
      'shell:chat-remove',
      'shell:chat-clear'
    ])
    expect(handlers.get('shell:chat-create')!(null, { extra: true })).toMatchObject({ ok: false })
    const created = await handlers.get('shell:chat-create')!(null, {})
    expect(created).toMatchObject({ ok: true, thread: { id: 'thread-1' } })
    expect(handlers.get('shell:chat-append')!(null, {
      id: 'thread-1',
      message: { role: 'user', text: 'Hello', createdAt: 1, extra: true }
    })).toMatchObject({ ok: false })
    expect(handlers.get('shell:chat-rename')!(null, { id: 'thread-1', title: '  ' })).toMatchObject({ ok: false })
    expect(handlers.get('shell:chat-append')!(null, {
      id: 'thread-1',
      message: { role: 'user', text: 'Hello', createdAt: 1 }
    })).toMatchObject({ ok: true, thread: { title: 'Hello' } })
    expect(handlers.get('shell:chat-clear')!(null, {})).toMatchObject({ ok: true, removed: 1 })
  })
})
