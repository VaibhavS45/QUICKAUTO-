import { describe, expect, it } from 'vitest'
import { ScheduleService, buildToday, localDateKey, msToNextMinute, progress } from '../../src/main/shell/schedule-service.js'
import { registerScheduleIpc } from '../../src/main/shell/schedule-ipc.js'
import { IpcChannels } from '../../src/main/ipc.js'
import type { RunRecord } from '../../src/shared/contracts/schedule.js'

function memoryRuns(): { records: unknown[]; storage: { load: () => unknown; save: (records: RunRecord[]) => void } } {
  const state: { records: unknown[] } = { records: [] }
  return {
    get records() { return state.records },
    storage: {
      load: () => state.records,
      save: (records) => {
        state.records.splice(0, state.records.length, ...records)
      }
    }
  }
}

describe('schedule-service', () => {
  it('buckets items by the local day, orders them, and computes progress', () => {
    const key = localDateKey(new Date(2026, 9, 10, 12))
    const at = (hour: number) => new Date(2026, 9, 10, hour).getTime()
    const item = (id: string, hour: number, status: 'done' | 'upcoming') => ({
      id,
      title: id,
      kind: 'schedule' as const,
      at: at(hour),
      status,
      toolIds: []
    })
    const today = buildToday([
      item('later', 18, 'upcoming'),
      item('earlier', 8, 'done'),
      { ...item('tomorrow', 0, 'done'), at: new Date(2026, 9, 11).getTime() }
    ], key)
    expect(today.items.map((entry) => entry.id)).toEqual(['earlier', 'later'])
    expect(progress(today)).toEqual({ label: '1 of 2 done', ratio: 0.5 })
    expect(progress(buildToday([], key)).ratio).toBe(0)
  })

  it('aligns the refresh interval to the next minute', () => {
    expect(msToNextMinute(60_000)).toBe(60_000)
    expect(msToNextMinute(61_250)).toBe(58_750)
  })

  it('provides today’s recurring routine and persisted recent runs', async () => {
    const now = new Date(2026, 9, 10, 12).getTime()
    const runs = memoryRuns()
    const service = new ScheduleService(() => [{
      id: 'daily',
      prompt: 'Check inbox',
      tools: ['gmail'],
      runAt: new Date(2026, 9, 9, 9).getTime(),
      repeat: 'daily',
      enabled: true,
      createdAt: now
    }], runs.storage, () => now)
    const notifications: number[] = []
    service.onChange(() => notifications.push(1))
    const today = await service.today()
    expect(today.items).toHaveLength(1)
    expect(today.items[0]).toMatchObject({ routineId: 'daily', status: 'upcoming', toolIds: ['gmail'] })
    service.recordRun({
      id: 'run-1',
      chatId: 'chat-1',
      title: 'Check inbox',
      startedAt: now,
      endedAt: now + 1,
      status: 'succeeded'
    })
    expect(await service.listRecentRuns(10)).toMatchObject([{ id: 'run-1', chatId: 'chat-1' }])
    expect(notifications).toHaveLength(1)
    expect(runs.records).toHaveLength(1)
  })

  it('rejects invalid dates and limits recent-task requests', async () => {
    const service = new ScheduleService(() => [], memoryRuns().storage)
    await expect(service.today('2026-13-40')).rejects.toThrow('Invalid local schedule date')
    for (let i = 0; i < 55; i++) service.recordRun({
      id: `r-${i}`,
      title: `Task ${i}`,
      startedAt: i,
      status: 'succeeded'
    })
    expect(await service.listRecentRuns(50)).toHaveLength(50)
    expect(await service.listRecentRuns(-10)).toHaveLength(0)
  })

  it('validates schedule IPC payloads and returns real source data', async () => {
    const service = new ScheduleService(() => [], memoryRuns().storage)
    const handlers = new Map<string, (_event: unknown, payload?: unknown) => unknown>()
    registerScheduleIpc({ handle: (channel, listener) => { handlers.set(channel, listener) } }, service)
    expect(await handlers.get(IpcChannels.scheduleToday)!(null, { date: 'yesterday' })).toMatchObject({ ok: false })
    expect(await handlers.get(IpcChannels.scheduleToday)!(null, {})).toMatchObject({
      ok: true,
      schedule: { items: [], done: 0, remaining: 0 }
    })
    expect(await handlers.get(IpcChannels.recentTasks)!(null, { limit: 51 })).toMatchObject({ ok: false })
  })
})
