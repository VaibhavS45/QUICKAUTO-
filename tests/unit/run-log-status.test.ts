import { describe, expect, it } from 'vitest'
import { runLogStatusFor } from '../../src/main/shell/runtime.js'
import { RunLogRecordSchema } from '../../src/shared/contracts/schedule.js'

describe('run-log status mapping (W12: cancelled shows cancelled)', () => {
  it('maps cancelled to cancelled (not failed)', () => {
    expect(runLogStatusFor('cancelled')).toBe('cancelled')
  })

  it('maps skipped_budget to skipped and waiting-approval to running', () => {
    expect(runLogStatusFor('skipped_budget')).toBe('skipped')
    expect(runLogStatusFor('waiting-approval')).toBe('running')
  })

  it('passes through terminal statuses', () => {
    expect(runLogStatusFor('succeeded')).toBe('succeeded')
    expect(runLogStatusFor('failed')).toBe('failed')
    expect(runLogStatusFor('running')).toBe('running')
  })

  it('the run-log contract accepts a cancelled status (additive member)', () => {
    const record = RunLogRecordSchema.parse({
      runId: 'r1',
      taskId: 't1',
      taskTitle: 'title',
      sourceType: 'schedule',
      startedAt: Date.now(),
      status: 'cancelled'
    })
    expect(record.status).toBe('cancelled')
  })
})
