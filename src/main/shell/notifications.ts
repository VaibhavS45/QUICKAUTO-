import { randomUUID } from 'node:crypto'
import {
  AppNotificationSchema,
  NewNotificationSchema,
  type AppNotification,
  type NewNotification
} from '../../shared/contracts/notifications.js'

export const MAX_NOTIFICATIONS = 200

export interface NotificationStorage {
  load(): unknown
  save(notifications: AppNotification[]): void
}

class MemoryNotificationStorage implements NotificationStorage {
  private items: unknown[] = []
  load(): unknown {
    return this.items
  }
  save(notifications: AppNotification[]): void {
    this.items = [...notifications]
  }
}

let storage: NotificationStorage = new MemoryNotificationStorage()

export function configureNotificationStorage(next: NotificationStorage): void {
  storage = next
}

function readStored(): AppNotification[] {
  const raw = storage.load()
  if (!Array.isArray(raw)) return []
  return raw.flatMap((value) => {
    const parsed = AppNotificationSchema.safeParse(value)
    return parsed.success ? [parsed.data] : []
  }).slice(0, MAX_NOTIFICATIONS)
}

export function notify(input: NewNotification): AppNotification {
  const notification = AppNotificationSchema.parse({
    ...NewNotificationSchema.parse(input),
    id: randomUUID(),
    createdAt: Date.now(),
    read: false
  })
  storage.save([notification, ...readStored()].slice(0, MAX_NOTIFICATIONS))
  return notification
}

export function listNotifications(): AppNotification[] {
  return readStored().map((notification) => ({ ...notification }))
}

export function markNotificationRead(id: string): boolean {
  const notifications = readStored()
  const notification = notifications.find((item) => item.id === id)
  if (!notification) return false
  notification.read = true
  storage.save(notifications)
  return true
}

export function markAllNotificationsRead(): number {
  const notifications = readStored()
  const count = notifications.filter((notification) => !notification.read).length
  if (count > 0) {
    for (const notification of notifications) notification.read = true
    storage.save(notifications)
  }
  return count
}

export function dismissNotification(id: string): boolean {
  const notifications = readStored()
  const remaining = notifications.filter((item) => item.id !== id)
  if (remaining.length === notifications.length) return false
  storage.save(remaining)
  return true
}
