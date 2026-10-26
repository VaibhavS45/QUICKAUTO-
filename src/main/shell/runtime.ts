import type { BrowserWindow, IpcMain } from 'electron'
import Store from 'electron-store'
import type { AppNotification } from '../../shared/contracts/notifications.js'
import type { AgentEvent } from '../../shared/agent.js'
import type { RunLogRecord, RunLogRawStorage, RunRecord } from '../../shared/contracts/schedule.js'
import { IpcChannels } from '../ipc.js'
import type { Routine } from '../agent/scheduler.js'
import { configureNotificationStorage, notify, type NotificationStorage } from './notifications.js'
import { registerNotificationIpc } from './notification-ipc.js'
import { registerScheduleIpc } from './schedule-ipc.js'
import { registerArtifactIpc } from './artifact-ipc.js'
import { RunArtifactService, type RunArtifactStorage } from './run-artifacts.js'
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

class ElectronRunLogStore implements RunLogRawStorage {
  private readonly store = new Store<{ 'run-logs': unknown[] }>({
    name: 'palette-shell',
    defaults: { 'run-logs': [] }
  })

  load(): unknown {
    return this.store.get('run-logs', [])
  }

  save(records: RunLogRecord[]): void {
    this.store.set('run-logs', records)
  }
}

interface RunArtifactStoreSchema {
  'run-artifacts': unknown[]
}

class ElectronRunArtifactStore implements RunArtifactStorage {
  private readonly store = new Store<RunArtifactStoreSchema>({
    name: 'palette-shell',
    defaults: { 'run-artifacts': [] }
  })

  load(): unknown {
    return this.store.get('run-artifacts', [])
  }

  save(records: Parameters<RunArtifactStorage['save']>[0]): void {
    this.store.set('run-artifacts', records)
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
  /** Run-log (activity feed) write path. */
  startRunLog(fields: {
    taskId: string
    taskTitle: string
    sourceType: RunLogRecord['sourceType']
    scheduledFor?: number
    startedAt?: number
    agentRunId?: string
  }): string
  appendRunLogStep(runId: string, step: { tool: string; input?: unknown; outputPreview?: string }): void
  finishRunLog(runId: string, patch: {
    status?: RunLogRecord['status']
    finishedAt?: number
    summary?: string
    error?: string
    currentStep?: string
  }): void
  getRunLog(runId: string): RunLogRecord | null
  onRunLogChange(cb: () => void): () => void
  /** Capture the files a tool result produced (artifact detail page + downloads). */
  recordToolResult(runId: string, toolName: string, output: unknown): void
  scheduleChanged(): void
  notify(input: Parameters<typeof notify>[0]): AppNotification
  notificationsChanged(): void
}

export type RunLogStatusLike = import('../../shared/contracts/schedule.js').RunLogRecord['status']
export type RunStatusLike = import('../../shared/contracts/schedule.js').RunRecord['status']

/**
 * Map a live run status onto the run-log (Updates feed) status. Cancelled
 * stays cancelled (W12) — a user stopping a run is not a failure;
 * budget-skips are skips; a run waiting on approval is still running.
 */
export function runLogStatusFor(status: RunStatusLike): RunLogStatusLike {
  switch (status) {
    case 'cancelled': return 'cancelled'
    case 'skipped_budget': return 'skipped'
    case 'waiting-approval': return 'running'
    default: return status
  }
}

export function createShellRuntime(
  ipc: IpcMain,
  getRoutines: () => Routine[],
  getWindow: () => BrowserWindow | null,
  markRoutineRan: (id: string, status: string) => void,
  /** Root dir for cached run artifacts; the app's userData on production. */
  getBaseDir: () => string = () => '.'
): ShellRuntime {
  const runs = new ElectronRunRecordStore()
  const runLogs = new ElectronRunLogStore()
  const runArtifacts = new ElectronRunArtifactStore()
  const notificationStore = new ElectronNotificationStore()
  configureNotificationStorage(notificationStore)
  const scheduleService = new ScheduleService(getRoutines, runs, runLogs)
  const artifactService = new RunArtifactService({ baseDir: getBaseDir(), storage: runArtifacts })
  const activeRecords = new Map<string, RunRecord>()
  const send = (channel: string): void => {
    const window = getWindow()
    if (window && !window.isDestroyed()) window.webContents.send(channel)
  }

  registerScheduleIpc(ipc, scheduleService)
  registerNotificationIpc(ipc, { changed: () => send(IpcChannels.notificationsChanged) })
  registerArtifactIpc(ipc, artifactService)
  scheduleService.onChange(() => send(IpcChannels.scheduleChanged))
  scheduleService.onRunLogChange(() => send(IpcChannels.updatesChanged))

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
    // ---- Run-log write path ----
    startRunLog: ({ taskId, taskTitle, sourceType, scheduledFor, startedAt = Date.now(), agentRunId }) => {
      const logRunId = agentRunId ?? `${Date.now()}-${Math.floor(Math.random() * 1e6)}`
      scheduleService.recordRunLog({
        taskId,
        taskTitle,
        sourceType,
        scheduledFor,
        startedAt,
        status: 'running'
      }, logRunId)
      return logRunId
    },
    appendRunLogStep: (runId, step) => {
      scheduleService.appendRunLogStep(runId, step)
    },
    finishRunLog: (runId, patch) => {
      scheduleService.finishRunLog(runId, patch)
    },
    getRunLog: (runId) => scheduleService.getRunLog(runId),
    onRunLogChange: (cb) => scheduleService.onRunLogChange(cb),
    recordToolResult: (runId, toolName, output) => {
      void artifactService.observeToolResult(runId, toolName, output)
    },
    scheduleChanged: () => scheduleService.changed(),
    notify,
    notificationsChanged: () => send(IpcChannels.notificationsChanged)
  }
}
