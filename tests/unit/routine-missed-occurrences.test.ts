import { describe, expect, it, vi } from 'vitest'
import { Scheduler, MemoryRoutineStore, type Routine } from '../../src/main/automations/schedule/scheduler.js'

const BASE = new Date(2026, 9, 7, 12, 0, 0) // Wed Oct 7 2026 noon local

const DAILY_0900 = (offsetDays: number): number => new Date(2026, 9, 7 + offsetDays, 9, 0, 0).getTime()

function routine(over: Partial<Routine> = {}): Routine {
  return {
    id: 'r1',
    prompt: 'summarize tasks',
    tools: [],
    runAt: DAILY_0900(-2),
    repeat: 'daily',
    enabled: true,
    createdAt: BASE.getTime(),
    ...over
  }
}

interface MissedLine {
  id: string
  runAt: number
  reason: string
}

describe('routine lastFiredAt persistence + missed occurrences on restart (W1/W10)', () => {
  it('records lastFiredAt each time a daily routine fires', () => {
    vi.useFakeTimers()
    try {
      const store = new MemoryRoutineStore()
      store.save([routine({ id: 'fired1', runAt: BASE.getTime() + 60_000 })])
      const s = new Scheduler(store, { fire: () => {}, now: () => BASE.getTime() })
      s.startAll()
      vi.advanceTimersByTime(61_000)
      // fire happens at the (unchanged) scheduler clock; the scheduled
      // occurrence value itself is what must be durably marked.
      expect(store.load()[0]?.lastFiredAt ?? 0).toBeGreaterThan(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('reports missed repeats on startAll from lastFiredAt, then dedupes across restarts', () => {
    const now = BASE.getTime()
    const store = new MemoryRoutineStore()
    store.save([routine({ id: 'miss1', lastFiredAt: DAILY_0900(-1) })])
    const missed: MissedLine[] = []
    const s = new Scheduler(store, {
      fire: () => {},
      now: () => now,
      missed: (r, reason) => missed.push({ id: r.id, runAt: r.runAt, reason })
    })
    s.startAll()
    expect(missed).toHaveLength(1)
    expect(missed[0]).toMatchObject({ id: 'miss1', runAt: DAILY_0900(0) })
    expect(store.load()[0]?.lastFiredAt).toBe(DAILY_0900(0))

    // Restart: no duplicates (stable state is persisted).
    const missed2: MissedLine[] = []
    const s2 = new Scheduler(store, {
      fire: () => {},
      now: () => now,
      missed: (r, reason) => missed2.push({ id: r.id, runAt: r.runAt, reason })
    })
    s2.startAll()
    expect(missed2).toHaveLength(0)
  })

  it('caps a long outage at 7 missed occurrences and drains over restarts', () => {
    const now = BASE.getTime()
    const store = new MemoryRoutineStore()
    store.save([routine({ id: 'cap1', runAt: DAILY_0900(-40), lastFiredAt: DAILY_0900(-10) })])
    const missed: MissedLine[] = []
    const s = new Scheduler(store, {
      fire: () => {},
      now: () => now,
      missed: (r, reason) => missed.push({ id: r.id, runAt: r.runAt, reason })
    })
    s.startAll()
    expect(missed).toHaveLength(7)
    expect(missed.map((m) => m.runAt)).toEqual([
      DAILY_0900(-9),
      DAILY_0900(-8),
      DAILY_0900(-7),
      DAILY_0900(-6),
      DAILY_0900(-5),
      DAILY_0900(-4),
      DAILY_0900(-3)
    ])
    // Next restarts drain the remaining gap, never reporting more than 7.
    const drained: number[] = []
    while (true) {
      drained.length = 0
      new Scheduler(store, {
        fire: () => {},
        now: () => now,
        missed: (r, _reason) => drained.push(r.runAt)
      }).startAll()
      if (store.load()[0]?.lastFiredAt === DAILY_0900(0)) break
      expect(drained.length).toBeGreaterThan(0)
      expect(drained.length).toBeLessThanOrEqual(7)
    }
    expect(store.load()[0]?.lastFiredAt).toBe(DAILY_0900(0))
    const after: MissedLine[] = []
    new Scheduler(store, {
      fire: () => {},
      now: () => now,
      missed: (r, reason) => after.push({ id: r.id, runAt: r.runAt, reason })
    }).startAll()
    expect(after).toHaveLength(0)
  })

  it('resuming a daily that is overdue today reports the skipped occurrence (W10)', () => {
    const now = BASE.getTime()
    const store = new MemoryRoutineStore()
    store.save([routine({ id: 'resume1', enabled: false, lastFiredAt: DAILY_0900(-1) })])
    const missed: MissedLine[] = []
    const s = new Scheduler(store, {
      fire: () => {},
      now: () => now,
      missed: (r, reason) => missed.push({ id: r.id, runAt: r.runAt, reason })
    })
    expect(s.setEnabled('resume1', true)?.enabled).toBe(true)
    expect(missed).toHaveLength(1)
    expect(missed[0]).toMatchObject({ id: 'resume1', runAt: DAILY_0900(0) })
  })

  it('never-fired routines (no lastFiredAt) report nothing', () => {
    const now = BASE.getTime()
    const store = new MemoryRoutineStore()
    store.save([routine({ id: 'fresh1', runAt: DAILY_0900(-5) })])
    const missed: MissedLine[] = []
    new Scheduler(store, {
      fire: () => {},
      now: () => now,
      missed: (r, reason) => missed.push({ id: r.id, runAt: r.runAt, reason })
    }).startAll()
    expect(missed).toHaveLength(0)
  })
})
