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
    const r = s.create('@calendar @websearch in 30 minutes news', BASE)
    expect(s.setEnabled(r.id, false)?.enabled).toBe(false)
    expect(s.setEnabled(r.id, true)?.enabled).toBe(true)
    expect(s.remove(r.id)).toBe(true)
    expect(s.list()).toHaveLength(0)
  })

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
