import {
  AutomationSchema,
  type Automation,
  type AutomationCreate,
  type AutomationPatch,
  type AutomationSchedule
} from '../../shared/contracts/automations.js'
import { nextFire, type Repeat, type Routine, type Scheduler } from '../agent/scheduler.js'
import { localDateKey } from '../shell/schedule-service.js'

/**
 * Scheduled Tasks view over the existing routine store: one stored routine
 * per automation, so the scheduler, the run log and the calendar keep working
 * unchanged.
 */

function clockKey(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function titleFromPrompt(prompt: string): string {
  const first = (prompt.split('\n')[0] ?? prompt).trim()
  return first.length > 80 ? `${first.slice(0, 80)}…` : first
}

/** Schedule view of a routine. Legacy "weekdays" repeats read as weekly Mon–Fri. */
export function scheduleOf(routine: Routine): AutomationSchedule | undefined {
  const at = new Date(routine.runAt)
  const time = clockKey(at)
  switch (routine.repeat) {
    case 'once':
      return { type: 'once', time, date: localDateKey(at) }
    case 'daily':
      return { type: 'daily', time }
    case 'weekdays':
      return { type: 'weekly', time, weekdays: [1, 2, 3, 4, 5] }
    case 'weekly':
      return { type: 'weekly', time, weekdays: routine.weekdays?.length ? [...routine.weekdays].sort((a, b) => a - b) : [at.getDay()] }
    case 'monthly':
      return { type: 'monthly', time, dayOfMonth: at.getDate() }
  }
}

function repeatOf(schedule: AutomationSchedule | undefined): Repeat {
  switch (schedule?.type) {
    case 'weekly':
      return 'weekly'
    case 'monthly':
      return 'monthly'
    case 'daily':
      return 'daily'
    default:
      return 'once'
  }
}

/**
 * Next fire time for a schedule, in the user's local timezone.
 * `dayOfMonth` carries the monthly day when the schedule has no date.
 */
export function resolveRunAt(
  schedule: AutomationSchedule,
  now: number,
  dayOfMonth: number
): number | null {
  const [hours, minutes] = schedule.time.split(':').map(Number)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null
  if (schedule.type === 'once') {
    if (!schedule.date) return null
    const date = new Date(`${schedule.date}T00:00:00`)
    if (Number.isNaN(date.getTime())) return null
    date.setHours(hours, minutes, 0, 0)
    return date.getTime()
  }
  const probe = new Date(now)
  probe.setHours(hours, minutes, 0, 0)
  if (schedule.type === 'daily') {
    if (probe.getTime() <= now) probe.setDate(probe.getDate() + 1)
    return probe.getTime()
  }
  if (schedule.type === 'weekly') {
    const days = schedule.weekdays ?? []
    if (days.length === 0) return null
    for (let i = 0; i < 8; i += 1) {
      if (days.includes(probe.getDay()) && probe.getTime() > now) return probe.getTime()
      probe.setDate(probe.getDate() + 1)
      probe.setHours(hours, minutes, 0, 0)
    }
    return null
  }
  // Monthly: same day-of-month, clamped to short months.
  const base = new Date(now)
  const wanted = schedule.dayOfMonth ?? dayOfMonth
  for (let i = 0; i < 14; i += 1) {
    const month = new Date(base.getFullYear(), base.getMonth() + i, 1, hours, minutes, 0, 0)
    const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
    const next = new Date(month.getFullYear(), month.getMonth(), Math.min(wanted, lastDay), hours, minutes, 0, 0)
    if (next.getTime() > now) return next.getTime()
  }
  return null
}

export function toAutomation(routine: Routine, now = Date.now()): Automation {
  // Every routine fires at a time, so it is a schedule unless it says otherwise.
  const kind = routine.kind ?? 'schedule'
  const expired = routine.expiresAt !== undefined && routine.expiresAt <= now
  const schedule = kind === 'advanced' ? undefined : scheduleOf(routine)
  const next = routine.enabled && !expired ? nextFire(routine, now) : null
  return AutomationSchema.parse({
    id: routine.id,
    kind,
    title: routine.title ?? titleFromPrompt(routine.prompt),
    ...(routine.prompt ? { prompt: routine.prompt } : {}),
    status: !routine.enabled || expired ? 'paused' : 'active',
    ...(schedule ? { schedule } : {}),
    autoApprove: routine.autoApprove ?? false,
    runMode: routine.runMode ?? 'separate_task',
    agent: routine.agent ?? '',
    connectors: [...routine.tools],
    ...(routine.expiresAt !== undefined ? { expiresAt: new Date(routine.expiresAt).toISOString() } : {}),
    createdAt: new Date(routine.createdAt).toISOString(),
    ...(routine.lastRunAt !== undefined ? { lastRunAt: new Date(routine.lastRunAt).toISOString() } : {}),
    ...(next !== null ? { nextRunAt: new Date(next).toISOString() } : {})
  })
}

export interface AutomationServiceOptions {
  scheduler: Scheduler
  /** Runs the automation once, right now; returns the run id. */
  runTest?: (routine: Routine) => string
  now?: () => number
}

export class AutomationService {
  private readonly now: () => number

  constructor(private readonly options: AutomationServiceOptions) {
    this.now = options.now ?? Date.now
  }

  list(): Automation[] {
    this.expireDue()
    return this.options.scheduler.list().map((routine) => toAutomation(routine, this.now()))
  }

  get(id: string): Automation | null {
    this.expireDue()
    const routine = this.find(id)
    return routine ? toAutomation(routine, this.now()) : null
  }

  create(input: AutomationCreate): Automation {
    const now = this.now()
    const kind = input.kind
    const prompt = input.prompt?.trim() ?? ''
    if (kind === 'schedule' && !prompt) throw new Error('A prompt is required for scheduled automations.')
    const runAt = input.schedule
      ? resolveRunAt(input.schedule, now, new Date(now).getDate())
      : now + 3_600_000
    if (runAt === null) throw new Error('The schedule needs a time and, for one-time tasks, a future date.')
    const routine: Routine = {
      id: `a-${now.toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`,
      prompt: prompt || input.title,
      tools: input.connectors,
      runAt,
      repeat: repeatOf(input.schedule),
      enabled: true,
      createdAt: now,
      title: input.title,
      kind,
      autoApprove: input.autoApprove,
      runMode: input.runMode,
      agent: input.agent,
      ...(input.schedule?.type === 'weekly'
        ? { weekdays: input.schedule.weekdays?.length ? input.schedule.weekdays : [new Date(runAt).getDay()] }
        : {}),
      ...(input.expiresAt ? { expiresAt: Date.parse(input.expiresAt) } : {})
    }
    const created = this.options.scheduler.add(routine)
    return toAutomation(created, now)
  }

  update(id: string, patch: AutomationPatch): Automation | null {
    const routine = this.find(id)
    if (!routine) return null
    const now = this.now()
    const kind = patch.kind ?? routine.kind ?? (routine.tools.length > 1 ? 'advanced' : 'schedule')
    const prompt = patch.prompt !== undefined ? patch.prompt.trim() : routine.prompt
    if (kind === 'schedule' && !prompt) throw new Error('A prompt is required for scheduled automations.')
    const patchRoutine: Parameters<Scheduler['update']>[1] = {}
    if (patch.title !== undefined) patchRoutine.title = patch.title.trim()
    if (patch.prompt !== undefined) patchRoutine.prompt = prompt
    if (patch.kind !== undefined) patchRoutine.kind = patch.kind
    if (patch.autoApprove !== undefined) patchRoutine.autoApprove = patch.autoApprove
    if (patch.runMode !== undefined) patchRoutine.runMode = patch.runMode
    if (patch.agent !== undefined) patchRoutine.agent = patch.agent
    if (patch.connectors !== undefined) patchRoutine.tools = patch.connectors
    if (patch.expiresAt !== undefined) {
      patchRoutine.expiresAt = patch.expiresAt === null ? null : Date.parse(patch.expiresAt)
    }
    if (patch.schedule) {
      const runAt = resolveRunAt(patch.schedule, now, new Date(routine.runAt).getDate())
      if (runAt === null) throw new Error('The schedule needs a time and, for one-time tasks, a future date.')
      patchRoutine.repeat = repeatOf(patch.schedule)
      patchRoutine.runAt = runAt
      patchRoutine.weekdays = patch.schedule.type === 'weekly'
        ? (patch.schedule.weekdays?.length ? patch.schedule.weekdays : [new Date(runAt).getDay()])
        : []
    }
    const updated = this.options.scheduler.update(id, patchRoutine)
    return updated ? toAutomation(updated, now) : null
  }

  setStatus(id: string, status: 'active' | 'paused'): Automation | null {
    const routine = this.find(id)
    if (!routine) return null
    const now = this.now()
    if (status === 'active' && routine.expiresAt !== undefined && routine.expiresAt <= now) {
      throw new Error('This automation has expired and cannot be resumed.')
    }
    const updated = this.options.scheduler.setEnabled(id, status === 'active')
    return updated ? toAutomation(updated, now) : null
  }

  remove(id: string): boolean {
    return this.options.scheduler.remove(id)
  }

  /** Runs the automation once without touching its schedule. */
  testRun(id: string): string | null {
    const routine = this.find(id)
    if (!routine) return null
    return this.options.runTest?.(routine) ?? ''
  }

  /** Expired automations pause themselves and never fire again. */
  private expireDue(): void {
    const now = this.now()
    for (const routine of this.options.scheduler.list()) {
      if (routine.enabled && routine.expiresAt !== undefined && routine.expiresAt <= now) {
        this.options.scheduler.setEnabled(routine.id, false)
      }
    }
  }

  private find(id: string): Routine | undefined {
    return this.options.scheduler.list().find((routine) => routine.id === id)
  }
}
