import { describe, expect, it } from 'vitest'
import { getScheduleSource, registerScheduleSource } from '../../src/main/agent/schedule-registry.js'
import {
  configureNotificationStorage,
  listNotifications,
  notify
} from '../../src/main/shell/notifications.js'
import { registerAutomationsIpc, registerShellIpc } from '../../src/main/agent/shell-ipc.js'
import type { NewNotification } from '../../src/shared/contracts/notifications.js'
import type { ScheduleSource } from '../../src/shared/contracts/schedule.js'
import { automationsApi } from '../../src/preload/automations.js'
import { shellApi } from '../../src/preload/shell.js'

describe('shell main-process contract modules', () => {
  it('replaces the registered schedule source', () => {
    const first: ScheduleSource = {
      listForDay: async () => [],
      listRecentRuns: async () => [],
      onChange: () => () => {}
    }
    const second: ScheduleSource = { ...first }
    registerScheduleSource(first)
    expect(getScheduleSource()).toBe(first)
    registerScheduleSource(second)
    expect(getScheduleSource()).toBe(second)
  })

  it('stores validated notifications newest-first and caps at 200', () => {
    const data: { notifications: unknown[] } = { notifications: [] }
    configureNotificationStorage({
      load: () => data.notifications,
      save: (notifications) => { data.notifications = notifications }
    })
    const first = notify({ kind: 'info', title: 'First' })
    expect(first.read).toBe(false)
    expect(listNotifications()[0]?.id).toBe(first.id)
    expect(() => notify({ kind: 'not-a-kind', title: 'Invalid' } as unknown as NewNotification)).toThrow()
    for (let i = 0; i < 205; i++) notify({ kind: 'info', title: `Notice ${i}` })
    expect(listNotifications()).toHaveLength(200)
    expect(data.notifications).toHaveLength(200)
  })

  it('exposes no window actions from the shell preload and callable IPC registration hooks', () => {
    expect(automationsApi).toEqual({})
    expect(Object.keys(shellApi).sort()).toEqual([
      'notificationCreate',
      'notificationDismiss',
      'notificationRead',
      'notificationsList',
      'notificationsReadAll',
      'onNotificationsChanged',
      'onScheduleChanged',
      'recentTasks',
      'scheduleToday'
    ])
    expect(() => registerShellIpc()).not.toThrow()
    expect(() => registerAutomationsIpc()).not.toThrow()
  })
})
