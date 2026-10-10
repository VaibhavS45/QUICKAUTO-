import { z } from 'zod'

export const MAX_THREADS = 200
export const MAX_MESSAGES_PER_THREAD = 500
export const MAX_HISTORY_MESSAGES = 20
export const CHAT_TITLE_MAX_LENGTH = 80

export const ChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  text: z.string().min(1).max(20000),
  createdAt: z.number().int().nonnegative()
}).strict()

export type ChatMessage = z.infer<typeof ChatMessageSchema>

export const ChatThreadSchema = z.object({
  id: z.string().min(1).max(128),
  title: z.string().min(1).max(CHAT_TITLE_MAX_LENGTH),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  messages: z.array(ChatMessageSchema).max(MAX_MESSAGES_PER_THREAD)
}).strict()

export type ChatThread = z.infer<typeof ChatThreadSchema>

export const ChatThreadIdSchema = z.object({ id: z.string().min(1).max(128) }).strict()
export const ChatCreateSchema = z.object({}).strict()
export const ChatAppendSchema = z.object({
  id: z.string().min(1).max(128),
  message: ChatMessageSchema
}).strict()
export const ChatRenameSchema = z.object({
  id: z.string().min(1).max(128),
  title: z.string().trim().min(1).max(CHAT_TITLE_MAX_LENGTH)
}).strict()
export const ChatClearSchema = z.object({}).strict()
