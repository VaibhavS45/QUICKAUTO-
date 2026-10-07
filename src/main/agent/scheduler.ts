import { z } from 'zod'
import { TOOL_IDS, parseMentionedTools, type ToolId } from '../../shared/types.js'

/**
 * Routines (OpenMausBot pattern, smallest cut): a prompt + @tools that fires
 * at a specific time and runs the agent as source 'scheduled' (writes denied,
 * BudgetGuard scheduled share). No polling, no Composio triggers — one
 * setTimeout per routine, rescheduled after each fire. The app stays alive in
 * the tray so timers can fire (see index.ts window-all-closed).
 */

export const RepeatSchema = z.enum(['once', 'daily', 'weekdays'])
export type Repeat = z.infer<typeof RepeatSchema>

export const RoutineSchema = z.object({
  id: z.string().min(1).max(128),
  prompt: z.string().min(1).max(20000),
  tools: z.array(z.string()).max(16),
  runAt: z.number().int().positive(),
  repeat: RepeatSchema,
  enabled: z.boolean(),
  createdAt: z.number().int(),
  lastRunAt: z.number().int().optional(),
  lastStatus: z.string().max(200).optional()
})
export type Routine = z.infer<typeof RoutineSchema>

export const CreateRoutineSchema = z.object({
  text: z.string().min(1).max(8000)
})

export interface RoutineStore {
  load(): Routine[]
  save(routines: Routine[]): void
}

export class MemoryRoutineStore implements RoutineStore {
  private data: Routine[] = []
  load(): Routine[] {
    return [...this.data]
  }
  save(routines: Routine[]): void {
    this.data = [...routines]
  }
}

function makeId(): string {
  return `r-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`
}

/**
 * Parse a fire time out of free text. Supports:
 * - "in 20 minutes" / "in 2 hours"
 * - "at 6:30pm" / "at 18:30" (today, or tomorrow if past)
 * - "tomorrow at 9am" / "tomorrow 9:30"
 * Returns null when no time found. `now` injectable for tests.
 */
export function parseScheduleFromText(text: string, now = new Date()): { runAt: number; timePhrase: string } | null {
  const rel = /in\s+(\d{1,4})\s*(mins?|minutes?|hrs?|hours?)\b/i.exec(text)
  if (rel) {
    const n = parseInt(rel[1]!, 10)
    const mins = /h/i.test(rel[2]!) ? n * 60 : n
    if (mins >= 1 && mins <= 7 * 24 * 60) {
      return { runAt: now.getTime() + mins * 60_000, timePhrase: rel[0] }
    }
  }
  const abs = /(tomorrow\s+)?at\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i.exec(text)
  if (abs) {
    let h = parseInt(abs[2]!, 10)
    const m = abs[3] ? parseInt(abs[3], 10) : 0
    const ap = abs[4]?.toLowerCase()
    if (ap === 'pm' && h < 12) h += 12
    if (ap === 'am' && h === 12) h = 0
    if (h > 23 || m > 59) return null
    const d = new Date(now)
    d.setHours(h, m, 0, 0)
    if (abs[1] || d.getTime() <= now.getTime() + 60_000) d.setDate(d.getDate() + 1)
    return { runAt: d.getTime(), timePhrase: abs[0] }
  }
  const tom = /tomorrow\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i.exec(text)
  if (tom) {
    let h = parseInt(tom[1]!, 10)
    const m = tom[2] ? parseInt(tom[2], 10) : 0
    const ap = tom[3]?.toLowerCase()
    if (ap === 'pm' && h < 12) h += 12
    if (ap === 'am' && h === 12) h = 0
    if (h > 23 || m > 59) return null
    const d = new Date(now)
    d.setDate(d.getDate() + 1)
    d.setHours(h, m, 0, 0)
    return { runAt: d.getTime(), timePhrase: tom[0] }
  }
  return null
}

/** Strip the @calendar mention + time phrase so the agent gets a clean task. */
export function cleanPromptForRoutine(text: string, timePhrase: string): string {
  return text
    .replace(/@calendar\s*/gi, '')
    .replace(timePhrase, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** Next fire time in ms, or null when nothing upcoming (disabled/one-shot past). */
export function nextFire(r: Routine, nowMs: number): number | null {
  if (!r.enabled) return null
  if (r.repeat === 'once') return r.runAt > nowMs ? r.runAt : null
  const at = new Date(r.runAt)
  const cand = new Date(nowMs)
  cand.setHours(at.getHours(), at.getMinutes(), 0, 0)
  if (cand.getTime() <= nowMs) cand.setDate(cand.getDate() + 1)
  if (r.repeat === 'daily') return cand.getTime()
  // weekdays: skip Sat/Sun.
  while (cand.getDay() === 0 || cand.getDay() === 6) cand.setDate(cand.getDate() + 1)
  return cand.getTime()
}

export interface SchedulerCallbacks {
  /** Called when a routine fires. Skip when it returns false (previous run active). */
  fire: (routine: Routine) => void
  /** True while a routine id still has a live run (skip-if-running). */
  isRunning?: (routineId: string) => boolean
  now?: () => number
}

const MAX_TIMER_MS = 2_147_483_647 // ponytail: setTimeout ceiling; longer waits re-arm hourly.

export class Scheduler {
  private timers = new Map<string, ReturnType<typeof setTimeout>>()
  private routines: Routine[] = []

  constructor(
    private readonly store: RoutineStore,
    private readonly cb: SchedulerCallbacks
  ) {
    this.routines = this.store.load().filter((r) => RoutineSchema.safeParse(r).success)
  }

  list(): Routine[] {
    return [...this.routines].sort((a, b) => a.runAt - b.runAt)
  }

  create(text: string, now = new Date()): Routine {
    const parsed = CreateRoutineSchema.parse({ text })
    const sched = parseScheduleFromText(parsed.text, now)
    if (!sched) throw new Error('No time found. Try "at 6:30pm", "tomorrow at 9am" or "in 20 minutes".')
    const allTools = parseMentionedTools(parsed.text).filter((t) => t !== 'calendar')
    const tools: ToolId[] = allTools.filter((t) => (TOOL_IDS as readonly string[]).includes(t))
    const prompt = cleanPromptForRoutine(parsed.text, sched.timePhrase)
    if (!prompt) throw new Error('Nothing left to do after removing the time. Describe the task too.')
    const routine: Routine = {
      id: makeId(),
      prompt,
      tools,
      runAt: sched.runAt,
      repeat: /weekday|mon|tue|wed|thu|fri/i.test(parsed.text) ? 'weekdays' : 'once',
      enabled: true,
      createdAt: now.getTime()
    }
    this.routines.push(routine)
    this.persist()
    this.arm(routine)
    return routine
  }

  remove(id: string): boolean {
    const before = this.routines.length
    this.routines = this.routines.filter((r) => r.id !== id)
    this.disarm(id)
    if (this.routines.length !== before) {
      this.persist()
      return true
    }
    return false
  }

  setEnabled(id: string, enabled: boolean): Routine | null {
    const r = this.routines.find((x) => x.id === id)
    if (!r) return null
    r.enabled = enabled
    this.persist()
    if (enabled) this.arm(r)
    else this.disarm(id)
    return { ...r }
  }

  markRan(id: string, status: string, atMs?: number): void {
    const r = this.routines.find((x) => x.id === id)
    if (!r) return
    r.lastRunAt = atMs ?? this.nowMs()
    r.lastStatus = status.slice(0, 200)
    // One-shot routines auto-disable after firing (OpenMausBot: routines arrive paused pattern inverted — keep enabled only for repeats).
    if (r.repeat === 'once') {
      r.enabled = false
      this.disarm(id)
    } else {
      this.arm(r)
    }
    this.persist()
  }

  /** (Re)start all timers — call once at app ready. */
  startAll(): void {
    for (const r of this.routines) this.arm(r)
  }

  stopAll(): void {
    for (const id of this.timers.keys()) this.disarm(id)
  }

  private nowMs(): number {
    return this.cb.now?.() ?? Date.now()
  }

  private persist(): void {
    this.store.save(this.routines)
  }

  private disarm(id: string): void {
    const t = this.timers.get(id)
    if (t) clearTimeout(t)
    this.timers.delete(id)
  }

  private arm(r: Routine): void {
    this.disarm(r.id)
    const next = nextFire(r, this.nowMs())
    if (next === null) return
    const delay = Math.min(Math.max(0, next - this.nowMs()), MAX_TIMER_MS)
    this.timers.set(
      r.id,
      setTimeout(() => this.onTimer(r.id), delay)
    )
  }

  private onTimer(id: string): void {
    const r = this.routines.find((x) => x.id === id)
    if (!r || !r.enabled) return
    // Interval aligned to start time: if the delay was clamped (far future),
    // re-arm instead of firing early.
    const expected = nextFire(r, this.nowMs())
    if (expected !== null && expected - this.nowMs() > 60_000) {
      this.arm(r)
      return
    }
    // Skip an occurrence when the previous run is still active (no queue build-up).
    if (this.cb.isRunning?.(id)) {
      this.markRan(id, 'skipped: previous run still active')
      return
    }
    this.cb.fire({ ...r })
  }
}
