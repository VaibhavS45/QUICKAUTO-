import type { BrowserWindow, IpcMain } from 'electron'
import Store from 'electron-store'
import type { AppNotification } from '../../shared/contracts/notifications.js'
import type { AgentEvent } from '../../shared/agent.js'
import type { RunRecord } from '../../shared/contracts/schedule.js'
import { IpcChannels } from '../ipc.js'
import type { Routine } from '../agent/scheduler.js'
import { configureNotificationStorage, notify, type NotificationStorage } from './notifications.js'
import { registerNotificationIpc } from './notification-ipc.js'
import { registerScheduleIpc } from './schedule-ipc.js'
import { ScheduleService, type RunRecordStorage } from './schedule-service.js'

type RunStatus = RunRecord['status']

class ElectronRunRecordStore implements RunRecordStorage {
  private readonly store = new Store<{ 'recent-runs': unknown[] }>({
    name: 'palette-shell',
    defaults: { 'recent-runs': [] }
  })

  load(): unknown {
    return this.store.get('recent-runs', [])
  }

  save(records: RunRecord[]): void {
    this.store.set('recent-runs', records)
  }
}

class ElectronNotificationStore implements NotificationStorage {
  private readonly store = new Store<{ notifications: unknown[] }>({
    name: 'palette-notifications',
    defaults: { notifications: [] }
  })

  load(): unknown {
    return this.store.get('notifications', [])
  }

  save(notifications: AppNotification[]): void {
    this.store.set('notifications', notifications)
  }
}

export interface ShellRuntime {
  scheduleService: ScheduleService
  startRun(record: Omit<RunRecord, 'status'>): void
  observeRunEvent(event: AgentEvent): void
  observeRunFailure(runId: string, message: string): void
  finishRun(runId: string): { status: RunStatus; summary?: string }
  scheduleChanged(): void
  notify(input: Parameters<typeof notify>[0]): AppNotification
  notificationsChanged(): void
}

export function createShellRuntime(
  ipc: IpcMain,
  getRoutines: () => Routine[],
  getWindow: () => BrowserWindow | null,
  markRoutineRan: (id: string, status: string) => void
): ShellRuntime {
  const runs = new ElectronRunRecordStore()
  const notificationStore = new ElectronNotificationStore()
  configureNotificationStorage(notificationStore)
  const scheduleService = new ScheduleService(getRoutines, runs)
  const activeRecords = new Map<string, RunRecord>()
  const send = (channel: string): void => {
    const window = getWindow()
    if (window && !window.isDestroyed()) window.webContents.send(channel)
  }

  registerScheduleIpc(ipc, scheduleService)
  registerNotificationIpc(ipc, { changed: () => send(IpcChannels.notificationsChanged) })
  scheduleService.onChange(() => send(IpcChannels.scheduleChanged))

  return {
    scheduleService,
    startRun: (record) => {
      const active: RunRecord = { ...record, status: 'running' }
      activeRecords.set(active.id, active)
      scheduleService.recordRun(active)
    },
    observeRunEvent: (event) => {
      const record = activeRecords.get(event.runId)
      if (!record) return
      if (event.type === 'done') {
        record.status = 'succeeded'
        record.summary = event.text.slice(0, 500)
      } else if (event.type === 'error') {
        record.status = 'failed'
        record.summary = event.message.slice(0, 500)
      } else if (event.type === 'aborted') {
        record.status = 'cancelled'
        record.summary = 'Run cancelled.'
      } else if (event.type === 'approval-requested') {
        record.status = 'waiting-approval'
      }
    },
    observeRunFailure: (runId, message) => {
      const record = activeRecords.get(runId)
      if (!record) return
      record.status = 'failed'
      record.summary = message.slice(0, 500)
    },
    finishRun: (runId) => {
      const record = activeRecords.get(runId)
      if (!record) return { status: 'failed', summary: 'Run record was not available.' }
      record.endedAt = Date.now()
      scheduleService.recordRun(record)
      activeRecords.delete(runId)
      if (record.routineId) {
        const status = record.status === 'failed'
          ? `error: ${record.summary ?? 'Run failed.'}`
          : record.status === 'succeeded'
            ? 'done'
            : record.status === 'cancelled'
              ? `skipped: ${record.summary ?? 'Run cancelled.'}`
              : record.summary ?? record.status
        markRoutineRan(record.routineId, status)
        if (record.status === 'succeeded') {
          notify({ kind: 'run-succeeded', title: 'Automation completed', body: record.title })
          send(IpcChannels.notificationsChanged)
        } else if (record.status === 'failed') {
          notify({ kind: 'run-failed', title: 'Automation failed', body: record.summary ?? record.title })
          send(IpcChannels.notificationsChanged)
        }
      }
      return { status: record.status, ...(record.summary ? { summary: record.summary } : {}) }
    },
    scheduleChanged: () => scheduleService.changed(),
    notify,
    notificationsChanged: () => send(IpcChannels.notificationsChanged)
  }
}
