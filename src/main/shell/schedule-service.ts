import type {
  RunRecord,
  ScheduleItem,
  ScheduleSource,
  TodaySchedule
} from '../../shared/contracts/schedule.js'
import { RunRecordSchema, ScheduleItemSchema, TodayScheduleSchema } from '../../shared/contracts/schedule.js'
import { nextFire, type Repeat } from '../agent/scheduler.js'

const MAX_RECENT_RUNS = 200

export interface ScheduleRoutine {
  id: string
  prompt: string
  tools: string[]
  runAt: number
  repeat: Repeat
  enabled: boolean
  createdAt: number
  lastRunAt?: number
  lastStatus?: string
}

export interface RunRecordStorage {
  load(): unknown
  save(records: RunRecord[]): void
}

export function localDateKey(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function buildToday(items: ScheduleItem[], date = localDateKey()): TodaySchedule {
  const parsedDate = new Date(`${date}T00:00:00`)
  if (Number.isNaN(parsedDate.getTime()) || localDateKey(parsedDate) !== date) {
    throw new Error(`Invalid local schedule date: ${date}`)
  }
  const todayItems = items
    .map((item) => ScheduleItemSchema.parse(item))
    .filter((item) => localDateKey(new Date(item.at)) === date)
    .sort((a, b) => a.at - b.at)
  const done = todayItems.filter((item) => item.status === 'done').length
  return TodayScheduleSchema.parse({
    date,
    items: todayItems,
    done,
    remaining: todayItems.length - done
  })
}

export function progress(schedule: TodaySchedule): { label: string; ratio: number } {
  const total = schedule.items.length
  return {
    label: `${schedule.done} of ${total} done`,
    ratio: total === 0 ? 0 : schedule.done / total
  }
}

export function msToNextMinute(now = Date.now()): number {
  return 60_000 - (now % 60_000)
}

function statusFor(routine: ScheduleRoutine, date: string): ScheduleItem['status'] {
  if (!routine.lastRunAt || localDateKey(new Date(routine.lastRunAt)) !== date) return 'upcoming'
  if (routine.lastStatus === 'done' || routine.lastStatus === 'succeeded') return 'done'
  if (routine.lastStatus?.startsWith('error')) return 'failed'
  if (routine.lastStatus?.startsWith('skipped') || routine.lastStatus?.startsWith('cancelled')) return 'skipped'
  return 'running'
}

function routineItemForDay(routine: ScheduleRoutine, date: string): ScheduleItem | null {
  const dayStart = new Date(`${date}T00:00:00`)
  if (Number.isNaN(dayStart.getTime()) || localDateKey(dayStart) !== date) return null
  const dayEnd = new Date(dayStart)
  dayEnd.setDate(dayEnd.getDate() + 1)
  let at: number | null = null

  if (routine.repeat === 'once') {
    if (localDateKey(new Date(routine.runAt)) === date) at = routine.runAt
    if (routine.lastRunAt && localDateKey(new Date(routine.lastRunAt)) === date) at = routine.lastRunAt
  } else {
    const probe = { ...routine, enabled: true }
    const candidate = nextFire(probe, dayStart.getTime() - 1)
    if (candidate !== null && candidate < dayEnd.getTime()) at = candidate
    if (routine.lastRunAt && localDateKey(new Date(routine.lastRunAt)) === date) at = routine.lastRunAt
  }

  if (at === null || (!routine.enabled && statusFor(routine, date) === 'upcoming')) return null
  return ScheduleItemSchema.parse({
    id: `routine:${routine.id}:${date}`,
    routineId: routine.id,
    title: routine.prompt,
    kind: 'schedule',
    at,
    status: statusFor(routine, date),
    toolIds: routine.tools
  })
}

export class ScheduleService implements ScheduleSource {
  private readonly listeners = new Set<() => void>()

  constructor(
    private readonly getRoutines: () => ScheduleRoutine[],
    private readonly runStorage: RunRecordStorage,
    private readonly now: () => number = Date.now
  ) {}

  async listForDay(date: string): Promise<ScheduleItem[]> {
    const parsedDate = new Date(`${date}T00:00:00`)
    if (Number.isNaN(parsedDate.getTime()) || localDateKey(parsedDate) !== date) {
      throw new Error(`Invalid local schedule date: ${date}`)
    }
    return this.getRoutines()
      .flatMap((routine) => {
        const item = routineItemForDay(routine, date)
        return item ? [item] : []
      })
      .sort((a, b) => a.at - b.at)
  }

  async today(date = localDateKey(new Date(this.now()))): Promise<TodaySchedule> {
    return buildToday(await this.listForDay(date), date)
  }

  async listRecentRuns(limit: number): Promise<RunRecord[]> {
    const capped = Math.max(0, Math.min(50, Math.floor(limit)))
    const raw = this.runStorage.load()
    if (!Array.isArray(raw)) return []
    return raw
      .flatMap((record) => {
        const parsed = RunRecordSchema.safeParse(record)
        return parsed.success ? [parsed.data] : []
      })
      .sort((a, b) => (b.endedAt ?? b.startedAt) - (a.endedAt ?? a.startedAt))
      .slice(0, capped)
  }

  recordRun(record: RunRecord): void {
    const parsed = RunRecordSchema.parse(record)
    const records = this.readRuns().filter((item) => item.id !== parsed.id)
    records.unshift(parsed)
    this.runStorage.save(records.slice(0, MAX_RECENT_RUNS))
    this.changed()
  }

  onChange(cb: () => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  changed(): void {
    for (const listener of this.listeners) listener()
  }

  private readRuns(): RunRecord[] {
    const raw = this.runStorage.load()
    if (!Array.isArray(raw)) return []
    return raw.flatMap((record) => {
      const parsed = RunRecordSchema.safeParse(record)
      return parsed.success ? [parsed.data] : []
    })
  }
}
