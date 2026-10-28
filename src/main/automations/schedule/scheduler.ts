import { z } from 'zod'
import { TOOL_IDS, parseMentionedTools, type ToolId } from '../../../shared/types.js'
import { CanvasStepSchema, type CanvasStepRecord } from '../../../shared/contracts/automations.js'

/**
 * Routines (OpenMausBot pattern, smallest cut): a prompt + @tools that fires
 * at a specific time and runs the agent as source 'scheduled' (writes denied,
 * BudgetGuard scheduled share). No polling, no Composio triggers — one
 * setTimeout per routine, rescheduled after each fire. The app stays alive in
 * the tray so timers can fire (see index.ts window-all-closed).
 */

export const RepeatSchema = z.enum(['once', 'daily', 'weekdays', 'weekly', 'monthly'])
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
  /** Epoch ms of the last occurrence handled (fired or scanned-skip). Additive. */
  lastFiredAt: z.number().int().optional(),
  lastStatus: z.string().max(200).optional(),
  // Scheduled Tasks fields (additive; older routines simply lack them).
  /** Display title, stored apart from the prompt. */
  title: z.string().max(200).optional(),
  kind: z.enum(['schedule', 'advanced']).optional(),
  /** 0 = Sunday. Used by repeat "weekly". */
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  autoApprove: z.boolean().optional(),
  runMode: z.enum(['separate_task', 'same_task']).optional(),
  agent: z.string().max(120).optional(),
  expiresAt: z.number().int().optional(),
  /** Canvas nodes as drawn (additive): the graph reopens exactly as edited. */
  canvasSteps: z.array(CanvasStepSchema).max(64).optional()
})
export type Routine = z.infer<typeof RoutineSchema> & { canvasSteps?: CanvasStepRecord[] }

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
    .replace(/(?:^|\.\s*)When:\s*[^.]*?\.\s*/i, ' ')
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
  if (r.repeat === 'weekly') {
    // Weekly repeats on the picked weekdays (0 = Sunday); defaults to the
    // weekday of the stored time.
    const days = r.weekdays?.length ? r.weekdays : [at.getDay()]
    for (let i = 0; i < 8; i += 1) {
      if (days.includes(cand.getDay())) return cand.getTime()
      cand.setDate(cand.getDate() + 1)
    }
    return cand.getTime()
  }
  if (r.repeat === 'monthly') {
    // Same day-of-month every month, clamped to short months.
    const base = new Date(nowMs)
    const day = at.getDate()
    for (let i = 0; i < 14; i += 1) {
      const probe = new Date(base.getFullYear(), base.getMonth() + i, 1, at.getHours(), at.getMinutes(), 0, 0)
      const lastDay = new Date(probe.getFullYear(), probe.getMonth() + 1, 0).getDate()
      const next = new Date(probe.getFullYear(), probe.getMonth(), Math.min(day, lastDay), at.getHours(), at.getMinutes(), 0, 0)
      if (next.getTime() > nowMs) return next.getTime()
    }
    return null
  }
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
  /** Called when an occurrence is skipped because its time already passed
   * (app was closed / occurrence moved into the past) so the run log can
   * record a 'missed' entry. */
  missed?: (routine: Routine, reason: string) => void
}

const MAX_TIMER_MS = 2_147_483_647 // ponytail: setTimeout ceiling; longer waits re-arm when the clamped timer elapses.

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
      repeat: /weekday|mon|tue|wed|thu|fri/i.test(parsed.text) ? 'weekdays' : /daily|every day/i.test(parsed.text) ? 'daily' : 'once',
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

  update(id: string, patch: {
    prompt?: string
    title?: string
    kind?: 'schedule' | 'advanced'
    repeat?: Repeat
    weekdays?: number[]
    runAt?: number
    tools?: string[]
    enabled?: boolean
    autoApprove?: boolean
    runMode?: 'separate_task' | 'same_task'
    agent?: string
    expiresAt?: number | null
    canvasSteps?: CanvasStepRecord[]
  }): Routine | null {
    const r = this.routines.find((x) => x.id === id)
    if (!r) return null
    if (typeof patch.prompt === 'string' && patch.prompt.trim()) r.prompt = patch.prompt.trim()
    if (typeof patch.title === 'string' && patch.title.trim()) r.title = patch.title.trim()
    if (patch.kind) r.kind = patch.kind
    if (patch.repeat) r.repeat = patch.repeat
    if (Array.isArray(patch.weekdays)) r.weekdays = patch.weekdays
    if (typeof patch.runAt === 'number' && patch.runAt > 0) r.runAt = patch.runAt
    if (Array.isArray(patch.tools)) r.tools = patch.tools
    if (typeof patch.enabled === 'boolean') r.enabled = patch.enabled
    if (typeof patch.autoApprove === 'boolean') r.autoApprove = patch.autoApprove
    if (patch.runMode) r.runMode = patch.runMode
    if (typeof patch.agent === 'string') r.agent = patch.agent
    if (Array.isArray(patch.canvasSteps)) r.canvasSteps = patch.canvasSteps
    if (patch.expiresAt === null) r.expiresAt = undefined
    else if (typeof patch.expiresAt === 'number') r.expiresAt = patch.expiresAt
    this.persist()
    if (r.enabled) this.arm(r)
    else this.disarm(id)
    return { ...r }
  }

  /** Add a fully-formed routine (Scheduled Tasks creates these directly). */
  add(routine: Routine): Routine {
    const parsed = RoutineSchema.parse(routine)
    this.routines.push(parsed)
    this.persist()
    if (parsed.enabled) this.arm(parsed)
    return { ...parsed }
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

  /** Swap accounts: drop this account's timers and load the other one's routines. */
  reload(): void {
    this.stopAll()
    this.routines = this.store.load().filter((r) => RoutineSchema.safeParse(r).success)
    this.startAll()
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
    this.reportSkippedOccurrences(r)
    const next = nextFire(r, this.nowMs())
    if (next === null) {
      // One-shot whose time already passed (e.g. app was closed): it can
      // never fire again, so disable it instead of leaving it enabled with
      // no timer.
      if (r.enabled && r.repeat === 'once' && r.runAt <= this.nowMs()) {
        r.enabled = false
        r.lastStatus = 'missed: scheduled time passed'
        this.persist()
        this.cb.missed?.({ ...r }, 'missed: scheduled time passed')
      }
      return
    }
    const delay = Math.min(Math.max(0, next - this.nowMs()), MAX_TIMER_MS)
    this.timers.set(
      r.id,
      setTimeout(() => this.onTimer(r.id), delay)
    )
  }

  /**
   * Occurrences that would have fired between the last handled occurrence
   * (lastFiredAt) and now — i.e. the app was quit/slept through them. Records
   * one 'missed' callback per occurrence (max 7 per arm; outages drain
   * across restarts) and advances lastFiredAt so restarts do not duplicate.
   */
  private reportSkippedOccurrences(r: Routine): void {
    if (r.repeat === 'once' || !r.enabled || !r.lastFiredAt) return
    let t = Math.max(r.lastFiredAt, r.runAt)
    const found: number[] = []
    for (let i = 0; i < 7; i += 1) {
      const occ = nextFire(r, t)
      if (occ === null || occ > this.nowMs()) break
      found.push(occ)
      t = occ
    }
    if (found.length === 0) return
    r.lastFiredAt = found[found.length - 1]
    this.persist()
    for (const occ of found) {
      this.cb.missed?.({ ...r, runAt: occ }, 'missed: app not running at scheduled time')
    }
  }

  private onTimer(id: string): void {
    const r = this.routines.find((x) => x.id === id)
    if (!r || !r.enabled) return
    // Interval aligned to start time: if the delay was clamped (far future
    // one-shot), re-arm instead of firing early. Repeats always resolve to a
    // future occurrence, so this check applies to one-shots only — otherwise
    // every repeat occurrence would re-arm instead of firing.
    if (r.repeat === 'once') {
      const expected = nextFire(r, this.nowMs())
      if (expected !== null && expected - this.nowMs() > 60_000) {
        this.arm(r)
        return
      }
    }
    // Durably mark this occurrence handled now (crash mid-run must not make
    // a restart re-report it as missed); runs that end still update
    // lastRunAt/lastStatus via markRan.
    r.lastFiredAt = this.nowMs()
    // Skip an occurrence when the previous run is still active (no queue build-up).
    if (this.cb.isRunning?.(id)) {
      this.markRan(id, 'skipped: previous run still active')
      return
    }
    this.persist()
    this.cb.fire({ ...r })
  }
}
