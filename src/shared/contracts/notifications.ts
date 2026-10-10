import { z } from 'zod'

export const NotificationKindSchema = z.enum([
  'run-succeeded',
  'run-failed',
  'approval-needed',
  'budget-warning',
  'connector-disconnected',
  'info'
])

export const NotificationLinkSchema = z.object({
  view: z.string().min(1),
  params: z.record(z.string(), z.unknown()).optional()
})

export const AppNotificationSchema = z.object({
  id: z.string().min(1),
  kind: NotificationKindSchema,
  title: z.string().min(1),
  body: z.string().optional(),
  link: NotificationLinkSchema.optional(),
  createdAt: z.number().int(),
  read: z.boolean()
})
export type AppNotification = z.infer<typeof AppNotificationSchema>

export const NewNotificationSchema = AppNotificationSchema.omit({
  id: true,
  createdAt: true,
  read: true
})
export type NewNotification = z.infer<typeof NewNotificationSchema>
