import { randomUUID } from 'node:crypto'
import {
  CHAT_TITLE_MAX_LENGTH,
  ChatMessageSchema,
  ChatThreadSchema,
  MAX_HISTORY_MESSAGES,
  MAX_MESSAGES_PER_THREAD,
  MAX_THREADS,
  type ChatMessage,
  type ChatThread
} from '../../shared/chat.js'

export interface ChatStoreStorage {
  get(key: string): unknown
  set(key: string, value: unknown): void
}

function titleFromMessage(text: string): string {
  const title = text.trim().replace(/\s+/g, ' ')
  return title.slice(0, CHAT_TITLE_MAX_LENGTH) || 'New chat'
}

export class ChatStore {
  constructor(
    private readonly storage: ChatStoreStorage,
    private readonly now: () => number = Date.now,
    private readonly makeId: () => string = randomUUID
  ) {}

  list(): ChatThread[] {
    const raw = this.storage.get('chat-threads')
    if (!Array.isArray(raw)) return []
    return raw
      .flatMap((value) => {
        const parsed = ChatThreadSchema.safeParse(value)
        return parsed.success ? [parsed.data] : []
      })
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_THREADS)
  }

  get(id: string): ChatThread | null {
    return this.list().find((thread) => thread.id === id) ?? null
  }

  create(): ChatThread {
    const at = this.now()
    const thread: ChatThread = {
      id: this.makeId(),
      title: 'New chat',
      createdAt: at,
      updatedAt: at,
      messages: []
    }
    this.save([thread, ...this.list()].slice(0, MAX_THREADS))
    return thread
  }

  append(id: string, message: ChatMessage): ChatThread | null {
    const parsed = ChatMessageSchema.parse(message)
    const threads = this.list()
    const index = threads.findIndex((thread) => thread.id === id)
    if (index < 0) return null

    const existing = threads[index]!
    const messages = [...existing.messages, parsed].slice(-MAX_MESSAGES_PER_THREAD)
    const updated: ChatThread = {
      ...existing,
      title: existing.title === 'New chat' && parsed.role === 'user' ? titleFromMessage(parsed.text) : existing.title,
      updatedAt: this.now(),
      messages
    }
    threads[index] = updated
    this.save(threads)
    return updated
  }

  historyFor(id: string): ChatMessage[] {
    return (this.get(id)?.messages ?? []).slice(-MAX_HISTORY_MESSAGES)
  }

  rename(id: string, title: string): boolean {
    const normalized = title.trim()
    if (!normalized) return false
    const threads = this.list()
    const thread = threads.find((item) => item.id === id)
    if (!thread) return false
    thread.title = normalized.slice(0, CHAT_TITLE_MAX_LENGTH)
    thread.updatedAt = this.now()
    this.save(threads)
    return true
  }

  remove(id: string): boolean {
    const threads = this.list()
    const remaining = threads.filter((thread) => thread.id !== id)
    if (remaining.length === threads.length) return false
    this.save(remaining)
    return true
  }

  clear(): number {
    const count = this.list().length
    this.save([])
    return count
  }

  prune(retentionDays: number): number {
    const cutoff = this.now() - Math.max(0, retentionDays) * 86_400_000
    const threads = this.list()
    const remaining = threads.filter((thread) => thread.updatedAt >= cutoff)
    this.save(remaining)
    return threads.length - remaining.length
  }

  private save(threads: ChatThread[]): void {
    this.storage.set('chat-threads', threads)
  }
}
