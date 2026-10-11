import { describe, expect, it } from 'vitest'
import { filterNewRuns, updateStreamRows } from '../../src/renderer/shell/UpdatesStream.js'

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
