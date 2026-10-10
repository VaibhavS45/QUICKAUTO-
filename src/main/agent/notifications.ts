import { randomUUID } from 'node:crypto'
import {
  NewNotificationSchema,
  type AppNotification,
  type NewNotification
} from '../../shared/contracts/notifications.js'

const MAX_NOTIFICATIONS = 200
const notifications: AppNotification[] = []

export function notify(input: NewNotification): AppNotification {
  const parsed = NewNotificationSchema.parse(input)
  const notification: AppNotification = {
    ...parsed,
    id: randomUUID(),
    createdAt: Date.now(),
    read: false
  }
  notifications.unshift(notification)
  notifications.length = Math.min(notifications.length, MAX_NOTIFICATIONS)
  return notification
}

export function listNotifications(): AppNotification[] {
  return notifications.map((notification) => ({ ...notification }))
}
