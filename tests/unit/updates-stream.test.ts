import { describe, expect, it } from 'vitest'
import { filterNewRuns, groupStreamRows, updateStreamRows, watchStreamRuns } from '../../src/renderer/shell/UpdatesStream.js'
import type { RunRecord } from '../../src/shared/contracts/schedule.js'

const runs = [
  { id: 'r1', title: 'nightly sync', summary: 'Synced 12 rows.\nSecond line.', startedAt: 1000, endedAt: 2000, status: 'succeeded' as const },
  { id: 'r2', title: 'job', summary: null as unknown as string, startedAt: 500, endedAt: null as unknown as number, status: 'failed' as const }
]

describe('updateStreamRows', () => {
  it('maps title with first-line summary and timing', () => {
    const rows = updateStreamRows(runs)
    expect(rows).toHaveLength(2)
    expect(rows[0].key).toBe('r1')
    expect(rows[0].title).toBeTruthy()
    expect(rows[0].body).toBe('Synced 12 rows.')
    expect(rows[0].at).toBe(2000)
    expect(rows[1].body).toBe('')
    expect(rows[1].at).toBe(500)
  })
})

describe('filterNewRuns', () => {
  it('keeps only runs newer than the last-close marker', () => {
    const rows = updateStreamRows(runs)
    expect(filterNewRuns(rows, 0).map((r) => r.key)).toEqual(['r1', 'r2'])
    expect(filterNewRuns(rows, 1000).map((r) => r.key)).toEqual(['r1'])
    expect(filterNewRuns(rows, 9999)).toHaveLength(0)
  })
})

describe('groupStreamRows', () => {
  it('groups by local day with the newest day first', () => {
    const day = new Date(2026, 9, 11, 9, 0).getTime()
    const older = new Date(2026, 9, 10, 12, 2).getTime()
    const rows = [
      { key: 'old', title: 'Digest', body: 'b', at: older, status: 'succeeded' },
      { key: 'new', title: 'Digest', body: 'b', at: day, status: 'succeeded' }
    ]
    const groups = groupStreamRows(rows)
    expect(groups).toHaveLength(2)
    expect(groups[0].key).toBe('2026-10-11')
    expect(groups[0].rows.map((r) => r.key)).toEqual(['new'])
    expect(groups[1].key).toBe('2026-10-10')
  })
})

describe('watchStreamRuns (W6: live refresh)', () => {
  function record(id: string): RunRecord {
    return { id, title: 't', startedAt: 1, status: 'succeeded' }
  }
  function prepare(
    recipe: { first: { ok: boolean; runs?: Array<{ id: string }> }; then: { ok: boolean; runs?: Array<{ id: string }> } }
  ) {
    let loads = 0
    const load: (n: number) => Promise<{ ok: boolean; runs?: RunRecord[] }> = async () => {
      const current = loads === 0 ? recipe.first : recipe.then
      loads += 1
      return {
        ok: current.ok,
        runs: current.runs ? current.runs.map((r) => record(r.id)) : undefined
      }
    }
    const listeners: Array<() => void> = []
    const onChange = (cb: () => void): (() => void) => {
      listeners.push(cb)
      return () => {
        listeners.length = 0
      }
    }
    const calls: Array<{ runs: RunRecord[]; failed: boolean }> = []
    const stop = watchStreamRuns(load, onChange, (next, failed) => calls.push({ runs: next, failed }))
    return { stop, listeners, calls, loadCount: () => loads }
  }

  it('loads immediately and refreshes on updates-changed', async () => {
    const h = prepare({ first: { ok: true, runs: [{ id: 'r1' }] }, then: { ok: true, runs: [{ id: 'r1' }, { id: 'r2' }] } })
    await new Promise((r) => setTimeout(r, 5))
    expect(h.calls.at(0)?.runs).toEqual([record('r1')])
    expect(h.listeners).toHaveLength(1)
    h.listeners[0]?.()
    await new Promise((r) => setTimeout(r, 5))
    expect(h.loadCount()).toBe(2)
    expect(h.calls.at(-1)?.runs).toEqual([record('r1'), record('r2')])
    expect(h.calls.every((call) => !call.failed)).toBe(true)
    h.stop()
    expect(h.listeners).toHaveLength(0)
  })

  it('surface load failure and stops listening after cleanup', async () => {
    const h = prepare({ first: { ok: false }, then: { ok: false } })
    await new Promise((r) => setTimeout(r, 5))
    expect(h.calls.at(0)?.failed).toBe(true)
    h.stop()
    h.listeners[0]?.()
    await new Promise((r) => setTimeout(r, 5))
    expect(h.loadCount()).toBe(1)
  })
})
