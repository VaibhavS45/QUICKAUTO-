import { describe, expect, it } from 'vitest'
import { Scheduler, MemoryRoutineStore, type Routine } from '../../src/main/automations/schedule/scheduler.js'

const BASE = new Date(2026, 9, 7, 12, 0, 0) // Wed Oct 7 2026 noon local

function routine(over: Partial<Routine> = {}): Routine {
  return {
    id: 'r1',
    prompt: 'summarize tasks',
    tools: [],
    runAt: BASE.getTime() + 3600_000,
    repeat: 'once',
    enabled: true,
    createdAt: BASE.getTime(),
    ...over
  }
}

describe('scheduler missed callback (RunLog "missed" writer)', () => {
  it('reports overdue one-shot on startAll', () => {
    const now = BASE.getTime()
    const missed: Array<{ id: string; runAt: number; reason: string }> = []
    const store = new MemoryRoutineStore()
    store.save([routine({ id: 'past1', runAt: now - 3600_000, title: 'Daily brief' })])
    const s = new Scheduler(store, {
      fire: () => {},
      now: () => now,
      missed: (r, reason) => missed.push({ id: r.id, runAt: r.runAt, reason })
    })
    s.startAll()
    expect(missed).toHaveLength(1)
    expect(missed[0]).toMatchObject({ id: 'past1', reason: expect.stringMatching(/missed/) })
  })

  it('reports a one-shot moved into the past', () => {
    const now = BASE.getTime()
    const missed: Array<{ id: string; reason: string }> = []
    const s = new Scheduler(new MemoryRoutineStore(), {
      fire: () => {},
      now: () => now,
      missed: (r, reason) => missed.push({ id: r.id, reason })
    })
    s.add(routine({ id: 'move1' }))
    expect(missed).toHaveLength(0)
    s.update('move1', { runAt: now - 60_000 })
    expect(missed).toHaveLength(1)
    expect(missed[0]?.id).toBe('move1')
  })

  it('does not report future routines', () => {
    const now = BASE.getTime()
    const missed: unknown[] = []
    const s = new Scheduler(new MemoryRoutineStore(), {
      fire: () => {},
      now: () => now,
      missed: () => missed.push({})
    })
    s.add(routine({ id: 'future1' }))
    s.setEnabled('future1', true)
    expect(missed).toHaveLength(0)
  })
})
