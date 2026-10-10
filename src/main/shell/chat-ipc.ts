import { IpcChannels } from '../ipc.js'
import {
  ChatAppendSchema,
  ChatClearSchema,
  ChatCreateSchema,
  ChatRenameSchema,
  ChatThreadIdSchema
} from '../../shared/chat.js'
import type { ChatStore } from './chat-store.js'

type ChatChannel = (typeof IpcChannels)[keyof typeof IpcChannels]

export interface ChatIpcRegistrar {
  handle(channel: ChatChannel, listener: (_event: unknown, payload?: unknown) => unknown): void
}

export function registerChatIpc(ipc: ChatIpcRegistrar, chats: ChatStore): void {
  ipc.handle(IpcChannels.chatList, () => ({ ok: true as const, threads: chats.list() }))

  ipc.handle(IpcChannels.chatGet, (_event, payload) => {
    const parsed = ChatThreadIdSchema.safeParse(payload)
    if (!parsed.success) return { ok: false as const, error: 'Invalid chat id.' }
    const thread = chats.get(parsed.data.id)
    return thread ? { ok: true as const, thread } : { ok: false as const, error: 'Chat not found.' }
  })

  ipc.handle(IpcChannels.chatCreate, (_event, payload) => {
    if (!ChatCreateSchema.safeParse(payload).success) return { ok: false as const, error: 'Invalid chat request.' }
    return { ok: true as const, thread: chats.create() }
  })

  ipc.handle(IpcChannels.chatAppend, (_event, payload) => {
    const parsed = ChatAppendSchema.safeParse(payload)
    if (!parsed.success) return { ok: false as const, error: 'Invalid chat message.' }
    const thread = chats.append(parsed.data.id, parsed.data.message)
    return thread ? { ok: true as const, thread } : { ok: false as const, error: 'Chat not found.' }
  })

  ipc.handle(IpcChannels.chatRename, (_event, payload) => {
    const parsed = ChatRenameSchema.safeParse(payload)
    if (!parsed.success) return { ok: false as const, error: 'Invalid chat title.' }
    return chats.rename(parsed.data.id, parsed.data.title)
      ? { ok: true as const, thread: chats.get(parsed.data.id) }
      : { ok: false as const, error: 'Chat not found.' }
  })

  ipc.handle(IpcChannels.chatRemove, (_event, payload) => {
    const parsed = ChatThreadIdSchema.safeParse(payload)
    if (!parsed.success) return { ok: false as const, error: 'Invalid chat id.' }
    return chats.remove(parsed.data.id)
      ? { ok: true as const }
      : { ok: false as const, error: 'Chat not found.' }
  })

  ipc.handle(IpcChannels.chatClear, (_event, payload) => {
    if (!ChatClearSchema.safeParse(payload).success) return { ok: false as const, error: 'Invalid clear request.' }
    return { ok: true as const, removed: chats.clear() }
  })
}
