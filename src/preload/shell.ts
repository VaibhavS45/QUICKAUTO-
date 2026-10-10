import { ipcRenderer } from 'electron'
import type { AppNotification } from '../shared/contracts/notifications.js'
import type { RunRecord, TodaySchedule } from '../shared/contracts/schedule.js'

export const shellApi = {
  scheduleToday: (date?: string): Promise<{ ok: boolean; schedule?: TodaySchedule; error?: string }> =>
    ipcRenderer.invoke('shell:schedule-today', date ? { date } : {}),
  recentTasks: (limit = 10): Promise<{ ok: boolean; runs?: RunRecord[]; error?: string }> =>
    ipcRenderer.invoke('shell:recent-tasks', { limit }),
  onScheduleChanged: (cb: () => void) => {
    const fn = (): void => cb()
    ipcRenderer.on('shell:schedule-changed', fn)
    return () => {
      ipcRenderer.removeListener('shell:schedule-changed', fn)
    }
  },
  notificationsList: (): Promise<{ ok: boolean; notifications?: AppNotification[]; error?: string }> =>
    ipcRenderer.invoke('shell:notifications-list', {}),
  notificationCreate: (
    notification: Omit<AppNotification, 'id' | 'createdAt' | 'read'>
  ): Promise<{ ok: boolean; notification?: AppNotification; error?: string }> =>
    ipcRenderer.invoke('shell:notification-create', notification),
  notificationRead: (id: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('shell:notification-read', { id }),
  notificationsReadAll: (): Promise<{ ok: boolean; updated?: number; error?: string }> =>
    ipcRenderer.invoke('shell:notifications-read-all', {}),
  notificationDismiss: (id: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('shell:notification-dismiss', { id }),
  onNotificationsChanged: (cb: () => void) => {
    const fn = (): void => cb()
    ipcRenderer.on('shell:notifications-changed', fn)
    return () => {
      ipcRenderer.removeListener('shell:notifications-changed', fn)
    }
  }
}
