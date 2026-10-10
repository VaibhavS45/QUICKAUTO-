import { beforeEach, describe, expect, it } from 'vitest'
import {
  configureNotificationStorage,
  dismissNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  notify
} from '../../src/main/shell/notifications.js'
import { registerNotificationIpc } from '../../src/main/shell/notification-ipc.js'
import { IpcChannels } from '../../src/main/ipc.js'
import type { AppNotification } from '../../src/shared/contracts/notifications.js'

function useMemoryStorage(): { notifications: unknown[] } {
  const state: { notifications: unknown[] } = { notifications: [] }
  configureNotificationStorage({
    load: () => state.notifications,
    save: (items: AppNotification[]) => { state.notifications = items }
  })
  return state
}

describe('persisted notifications', () => {
  beforeEach(() => { useMemoryStorage() })

  it('persists newest first, retains 200, marks read, and dismisses', () => {
    const first = notify({ kind: 'info', title: 'First' })
    expect(listNotifications()[0]?.id).toBe(first.id)
    for (let i = 0; i < 205; i++) notify({ kind: 'info', title: `Notice ${i}` })
    expect(listNotifications()).toHaveLength(200)
    const current = listNotifications()[0]!
    expect(markNotificationRead(current.id)).toBe(true)
    expect(markAllNotificationsRead()).toBe(199)
    expect(listNotifications().every((item) => item.read)).toBe(true)
    expect(dismissNotification(current.id)).toBe(true)
    expect(listNotifications()).toHaveLength(199)
  })

  it('validates creation and id payloads at the IPC boundary', () => {
    const handlers = new Map<string, (_event: unknown, payload?: unknown) => unknown>()
    let changed = 0
    registerNotificationIpc({
      handle: (channel, listener) => { handlers.set(channel, listener) }
    }, { changed: () => { changed++ } })
    const create = handlers.get(IpcChannels.notificationCreate)!
    expect(create(null, { kind: 'info', title: 'Ready' })).toMatchObject({ ok: true })
    expect(create(null, { kind: 'wrong', title: 'Nope' })).toMatchObject({ ok: false })
    expect(handlers.get(IpcChannels.notificationRead)!(null, { id: 'not-found' })).toMatchObject({ ok: false })
    expect(handlers.get(IpcChannels.notificationsList)!(null, { bad: true })).toMatchObject({ ok: false })
    expect(changed).toBe(1)
  })
})
