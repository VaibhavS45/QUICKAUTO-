import { IpcChannels } from '../ipc.js'
import { EmptyShellRequestSchema, NotificationCreateSchema, NotificationIdSchema } from './ipc.js'
import {
  dismissNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notify
} from './notifications.js'

type NotificationChannel =
  | typeof IpcChannels.notificationsList
  | typeof IpcChannels.notificationCreate
  | typeof IpcChannels.notificationRead
  | typeof IpcChannels.notificationsReadAll
  | typeof IpcChannels.notificationDismiss

export interface NotificationIpcRegistrar {
  handle(channel: NotificationChannel, listener: (_event: unknown, payload?: unknown) => unknown): void
}

export interface NotificationIpcEffects {
  changed(): void
}

export function registerNotificationIpc(
  ipc: NotificationIpcRegistrar,
  effects: NotificationIpcEffects
): void {
  ipc.handle(IpcChannels.notificationsList, (_event, payload) => {
    if (!EmptyShellRequestSchema.safeParse(payload).success) return { ok: false as const, error: 'Invalid notification request.' }
    return { ok: true as const, notifications: listNotifications() }
  })

  ipc.handle(IpcChannels.notificationCreate, (_event, payload) => {
    const parsed = NotificationCreateSchema.safeParse(payload)
    if (!parsed.success) return { ok: false as const, error: 'Invalid notification.' }
    const notification = notify(parsed.data)
    effects.changed()
    return { ok: true as const, notification }
  })

  ipc.handle(IpcChannels.notificationRead, (_event, payload) => {
    const parsed = NotificationIdSchema.safeParse(payload)
    if (!parsed.success) return { ok: false as const, error: 'Invalid notification id.' }
    const updated = markNotificationRead(parsed.data.id)
    if (updated) effects.changed()
    return updated ? { ok: true as const } : { ok: false as const, error: 'Notification not found.' }
  })

  ipc.handle(IpcChannels.notificationsReadAll, (_event, payload) => {
    if (!EmptyShellRequestSchema.safeParse(payload).success) return { ok: false as const, error: 'Invalid notification request.' }
    const updated = markAllNotificationsRead()
    if (updated > 0) effects.changed()
    return { ok: true as const, updated }
  })

  ipc.handle(IpcChannels.notificationDismiss, (_event, payload) => {
    const parsed = NotificationIdSchema.safeParse(payload)
    if (!parsed.success) return { ok: false as const, error: 'Invalid notification id.' }
    const removed = dismissNotification(parsed.data.id)
    if (removed) effects.changed()
    return removed ? { ok: true as const } : { ok: false as const, error: 'Notification not found.' }
  })
}
