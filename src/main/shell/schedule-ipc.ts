import { IpcChannels } from '../ipc.js'
import { RecentTasksRequestSchema, ScheduleDateRequestSchema } from './ipc.js'
import type { RunRecord, TodaySchedule } from '../../shared/contracts/schedule.js'
import type { ScheduleService } from './schedule-service.js'

type ScheduleChannel = typeof IpcChannels.scheduleToday | typeof IpcChannels.recentTasks

export interface ScheduleIpcRegistrar {
  handle(channel: ScheduleChannel, listener: (_event: unknown, payload?: unknown) => unknown): void
}

export function registerScheduleIpc(ipc: ScheduleIpcRegistrar, schedule: ScheduleService): void {
  ipc.handle(IpcChannels.scheduleToday, async (_event, payload) => {
    const parsed = ScheduleDateRequestSchema.safeParse(payload)
    if (!parsed.success) return { ok: false as const, error: 'Invalid schedule date.' }
    try {
      const today: TodaySchedule = await schedule.today(parsed.data.date)
      return { ok: true as const, schedule: today }
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipc.handle(IpcChannels.recentTasks, async (_event, payload) => {
    const parsed = RecentTasksRequestSchema.safeParse(payload)
    if (!parsed.success) return { ok: false as const, error: 'Invalid recent-task request.' }
    const runs: RunRecord[] = await schedule.listRecentRuns(parsed.data.limit)
    return { ok: true as const, runs }
  })
}
