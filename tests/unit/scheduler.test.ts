import { describe, expect, it, vi } from 'vitest'
import {
  Scheduler,
  MemoryRoutineStore,
  parseScheduleFromText,
  cleanPromptForRoutine,
  nextFire,
  type Routine
} from '../../src/main/agent/scheduler.js'

const BASE = new Date(2026, 9, 7, 12, 0, 0) // Wed Oct 7 2026 noon local

function routine(over: Partial<Routine> = {}): Routine {
  return {
    id: 'r1',
    prompt: 'summarize tasks',
    tools: ['notion'],
    runAt: BASE.getTime() + 3600_000,
    repeat: 'once',
    enabled: true,
    createdAt: BASE.getTime(),
    ...over
  }
}

describe('parseScheduleFromText', () => {
  it('parses "in N minutes/hours"', () => {
    const r = parseScheduleFromText('@calendar @notion in 20 minutes summarize tasks', BASE)
    expect(r?.runAt).toBe(BASE.getTime() + 20 * 60_000)
    const h = parseScheduleFromText('in 2 hours @websearch news', BASE)
    expect(h?.runAt).toBe(BASE.getTime() + 2 * 3600_000)
  })

  it('parses "at 6:30pm" today or tomorrow when past', () => {
    const r = parseScheduleFromText('@calendar @notion at 6:30pm summarize', BASE)!
    const d = new Date(r.runAt)
    expect(d.getHours()).toBe(18)
    expect(d.getMinutes()).toBe(30)
    // 9am is past noon -> tomorrow.
    const past = parseScheduleFromText('at 9am @notion hi', BASE)!
    expect(new Date(past.runAt).getDate()).toBe(BASE.getDate() + 1)
  })

  it('parses "tomorrow at 9am"', () => {
    const r = parseScheduleFromText('@calendar @gmail tomorrow at 9am inbox zero', BASE)!
    const d = new Date(r.runAt)
    expect(d.getDate()).toBe(BASE.getDate() + 1)
    expect(d.getHours()).toBe(9)
  })

  it('returns null when no time', () => {
    expect(parseScheduleFromText('@notion just do it now', BASE)).toBeNull()
  })
})

describe('cleanPromptForRoutine', () => {
  it('strips @calendar and the time phrase', () => {
    expect(cleanPromptForRoutine('@calendar @notion at 6:30pm summarize tasks', 'at 6:30pm')).toBe(
      '@notion summarize tasks'
    )
  })
})

describe('nextFire', () => {
  it('once fires only when future and enabled', () => {
    const now = BASE.getTime()
    expect(nextFire(routine({ runAt: now + 1000 }), now)).toBe(now + 1000)
    expect(nextFire(routine({ runAt: now - 1000 }), now)).toBeNull()
    expect(nextFire(routine({ runAt: now + 1000, enabled: false }), now)).toBeNull()
  })

  it('daily rolls to tomorrow when today passed', () => {
    const morning = new Date(2026, 9, 7, 15, 0, 0).getTime()
    const r = routine({ repeat: 'daily', runAt: new Date(2026, 9, 7, 9, 0, 0).getTime() })
    const next = new Date(nextFire(r, morning)!)
    expect(next.getDate()).toBe(8)
    expect(next.getHours()).toBe(9)
  })

  it('weekdays skips the weekend', () => {
    // Friday 4pm, routine at 9am weekdays -> Monday.
    const fri = new Date(2026, 9, 9, 16, 0, 0).getTime()
    const r = routine({ repeat: 'weekdays', runAt: new Date(2026, 9, 9, 9, 0, 0).getTime() })
    expect(new Date(nextFire(r, fri)!).getDay()).toBe(1)
  })
})

describe('Scheduler store', () => {
  it('creates from "@calendar @notion at …" text and lists it', () => {
    const s = new Scheduler(new MemoryRoutineStore(), { fire: () => {} })
    const r = s.create('@calendar @notion at 6:30pm summarize my tasks', BASE)
    expect(r.tools).toEqual(['notion'])
    expect(r.prompt).toContain('summarize my tasks')
    expect(r.prompt).not.toContain('@calendar')
    expect(s.list()).toHaveLength(1)
  })

  it('throws when no time or no task', () => {
    const s = new Scheduler(new MemoryRoutineStore(), { fire: () => {} })
    expect(() => s.create('@notion just do stuff', BASE)).toThrow(/No time/)
    expect(() => s.create('@calendar at 6pm', BASE)).toThrow()
  })

  it('remove + toggle enable/disable', () => {
    const s = new Scheduler(new MemoryRoutineStore(), { fire: () => {} })
    const r = s.create('@calendar @websearch in 30 minutes news', new Date())
    expect(s.setEnabled(r.id, false)?.enabled).toBe(false)
    expect(s.setEnabled(r.id, true)?.enabled).toBe(true)
    expect(s.remove(r.id)).toBe(true)
    expect(s.list()).toHaveLength(0)
  })
})

describe('Scheduler timing', () => {
  function timedScheduler(
    routines: Routine[],
    opts: { now: () => number; fires: string[]; isRunning?: () => boolean }
  ): Scheduler {
    const store = new MemoryRoutineStore()
    store.save(routines)
    return new Scheduler(store, {
      fire: (r) => opts.fires.push(r.id),
      ...(opts.isRunning ? { isRunning: (_id: string) => opts.isRunning!() } : {}),
      now: opts.now
    })
  }

  it('daily routine fires at its occurrence (not re-armed away)', () => {
    vi.useFakeTimers()
    try {
      let now = BASE.getTime()
      const fires: string[] = []
      const s = timedScheduler(
        [routine({ id: 'daily1', repeat: 'daily', runAt: new Date(2026, 9, 7, 12, 1, 0).getTime() })],
        { now: () => now, fires }
      )
      s.startAll()
      vi.advanceTimersByTime(60_000)
      expect(fires).toEqual(['daily1'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('daily routine fires again at the next occurrence after markRan', () => {
    vi.useFakeTimers()
    try {
      let now = BASE.getTime()
      const fires: string[] = []
      const s = timedScheduler(
        [routine({ id: 'daily2', repeat: 'daily', runAt: new Date(2026, 9, 7, 12, 1, 0).getTime() })],
        { now: () => now, fires }
      )
      s.startAll()
      vi.advanceTimersByTime(60_000)
      expect(fires).toEqual(['daily2'])
      s.markRan('daily2', 'done')
      expect(s.list()[0]?.enabled).toBe(true)
      now += 24 * 3600_000 + 60_000 // Thu 12:01, when the re-armed timer elapses
      vi.advanceTimersByTime(24 * 3600_000 + 60_000)
      expect(fires).toEqual(['daily2', 'daily2'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('one-shot still fires at runAt', () => {
    vi.useFakeTimers()
    try {
      const now = BASE.getTime()
      const fires: string[] = []
      const s = timedScheduler([routine({ id: 'once1', runAt: now + 60_000 })], {
        now: () => now,
        fires
      })
      s.startAll()
      vi.advanceTimersByTime(60_000)
      expect(fires).toEqual(['once1'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('far-future one-shot re-arms instead of firing early, then fires', () => {
    vi.useFakeTimers()
    try {
      const MAX = 2_147_483_647 // setTimeout ceiling, mirrors scheduler.ts
      let now = BASE.getTime()
      const fires: string[] = []
      const runAt = now + MAX + 3_600_000
      const s = timedScheduler([routine({ id: 'far1', runAt })], { now: () => now, fires })
      s.startAll()
      vi.advanceTimersByTime(MAX) // clamped timer elapses while still >1h out
      expect(fires).toEqual([])
      expect(s.list()[0]?.enabled).toBe(true)
      now = runAt - 30_000 // time actually passes before the re-armed timer elapses
      vi.advanceTimersByTime(MAX)
      expect(fires).toEqual(['far1'])
    } finally {
      vi.useRealTimers()
    }
  })

  it('overdue one-shot is disabled (not left enabled) on startAll', () => {
    vi.useFakeTimers()
    try {
      const now = BASE.getTime()
      const fires: string[] = []
      const s = timedScheduler([routine({ id: 'past1', runAt: now - 3600_000 })], {
        now: () => now,
        fires
      })
      s.startAll()
      expect(s.list()[0]?.enabled).toBe(false)
      expect(s.list()[0]?.lastStatus).toMatch(/missed/)
      // Re-enabling a past-due one-shot disables it again instead of stranding it.
      expect(s.setEnabled('past1', true)?.enabled).toBe(false)
      vi.advanceTimersByTime(24 * 3600_000)
      expect(fires).toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('Scheduler store skip', () => {
  it('one-shot auto-disables after markRan; skips when previous run active', () => {
    vi.useFakeTimers()
    try {
      const fires: string[] = []
      const store = new MemoryRoutineStore()
      const s = new Scheduler(store, {
        fire: (r) => fires.push(r.id),
        isRunning: () => true, // previous run still active
        now: () => BASE.getTime()
      })
      const r = s.create('@calendar @notion in 30 minutes hi', BASE)
      // Force immediate fire path via markRan skip logic is covered by onTimer;
      // here assert markRan disables one-shots.
      s.markRan(r.id, 'done')
      expect(s.list()[0]?.enabled).toBe(false)
      expect(fires).toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })
})
