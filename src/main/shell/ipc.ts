import { z } from 'zod'
import { NewNotificationSchema } from '../../shared/contracts/notifications.js'

export const ShellIpcChannels = {
  scheduleToday: 'shell:schedule-today',
  recentTasks: 'shell:recent-tasks',
  scheduleChanged: 'shell:schedule-changed',
  notificationsList: 'shell:notifications-list',
  notificationCreate: 'shell:notification-create',
  notificationRead: 'shell:notification-read',
  notificationsReadAll: 'shell:notifications-read-all',
  notificationDismiss: 'shell:notification-dismiss',
  notificationsChanged: 'shell:notifications-changed'
} as const

export const ScheduleDateRequestSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
}).strict()

export const RecentTasksRequestSchema = z.object({
  limit: z.number().int().min(0).max(50)
}).strict()

export const NotificationIdSchema = z.object({
  id: z.string().min(1).max(256)
}).strict()

export const EmptyShellRequestSchema = z.object({}).strict()
export const NotificationCreateSchema = NewNotificationSchema
