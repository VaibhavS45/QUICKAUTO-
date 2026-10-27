import { describe, expect, it } from 'vitest'
import {
  AutomationService,
  resolveRunAt,
  scheduleOf,
  toAutomation
} from '../../src/main/automations/schedule/automation-service.js'
import { registerAutomationIpc } from '../../src/main/automations/schedule/automation-ipc.js'
import { MemoryRoutineStore, Scheduler, type Routine } from '../../src/main/automations/schedule/scheduler.js'

const BASE = new Date(2026, 9, 7, 12, 0, 0) // Wed Oct 7 2026 noon local

function routine(over: Partial<Routine> = {}): Routine {
  return {
    id: 'r1',
    prompt: 'summarize tasks',
    tools: ['notion'],
    runAt: new Date(2026, 9, 8, 9, 0, 0).getTime(),
    repeat: 'daily',
    enabled: true,
    createdAt: BASE.getTime(),
    ...over
  }
}

function makeService(now = BASE.getTime()): { service: AutomationService; scheduler: Scheduler } {
  const scheduler = new Scheduler(new MemoryRoutineStore(), { fire: () => {}, now: () => now })
  return { service: new AutomationService({ scheduler, now: () => now }), scheduler }
}

describe('scheduleOf', () => {
  it('maps legacy repeats onto the schedule view', () => {
    const at = new Date(2026, 9, 7, 9, 30, 0).getTime()
    expect(scheduleOf(routine({ repeat: 'daily', runAt: at }))).toEqual({ type: 'daily', time: '09:30' })
    expect(scheduleOf(routine({ repeat: 'weekdays', runAt: at }))).toEqual({
      type: 'weekly',
      time: '09:30',
      weekdays: [1, 2, 3, 4, 5]
    })
    expect(scheduleOf(routine({ repeat: 'weekly', runAt: at, weekdays: [3, 1] }))).toEqual({
      type: 'weekly',
      time: '09:30',
      weekdays: [1, 3]
    })
  })
})

describe('resolveRunAt', () => {
  it('resolves a one-time task on its date', () => {
    const at = resolveRunAt({ type: 'once', time: '14:30', date: '2026-10-09' }, BASE.getTime(), 7)
    const date = new Date(at!)
    expect(date.getDate()).toBe(9)
    expect(date.getHours()).toBe(14)
  })

  it('rolls a daily task to tomorrow when today has passed', () => {
    const at = resolveRunAt({ type: 'daily', time: '09:00' }, BASE.getTime(), 7)
    const date = new Date(at!)
    expect(date.getDate()).toBe(8)
    expect(date.getHours()).toBe(9)
  })

  it('jumps to the next picked weekday', () => {
    const at = resolveRunAt({ type: 'weekly', time: '09:00', weekdays: [1] }, BASE.getTime(), 7)
    expect(new Date(at!).getDay()).toBe(1)
  })

  it('clamps a monthly task to the last day of a short month', () => {
    // Day 31 in February -> Feb 28.
    const at = resolveRunAt({ type: 'monthly', time: '08:00' }, new Date(2026, 1, 1).getTime(), 31)
    const date = new Date(at!)
    expect(date.getMonth()).toBe(1)
    expect(date.getDate()).toBe(28)
  })

  it('rejects an incomplete schedule', () => {
    expect(resolveRunAt({ type: 'once', time: '09:00' }, BASE.getTime(), 7)).toBeNull()
    expect(resolveRunAt({ type: 'weekly', time: '09:00' }, BASE.getTime(), 7)).toBeNull()
  })
})

describe('toAutomation', () => {
  it('reads a routine as a paused automation when disabled', () => {
    const automation = toAutomation(routine({ enabled: false, title: 'Nightly sync' }), BASE.getTime())
    expect(automation.status).toBe('paused')
    expect(automation.title).toBe('Nightly sync')
    expect(automation.nextRunAt).toBeUndefined()
  })

  it('pauses an expired automation and drops its next run', () => {
    const automation = toAutomation(
      routine({ expiresAt: BASE.getTime() - 1000 }),
      BASE.getTime()
    )
    expect(automation.status).toBe('paused')
    expect(automation.nextRunAt).toBeUndefined()
  })

  it('keeps the schedule of an advanced routine so the canvas can show it', () => {
    const automation = toAutomation(routine({ kind: 'advanced' }), BASE.getTime())
    expect(automation.kind).toBe('advanced')
    expect(automation.schedule?.type).toBe('daily')
  })
})

describe('AutomationService', () => {
  it('creates, updates, pauses and removes an automation', () => {
    const { service } = makeService()
    const created = service.create({
      kind: 'schedule',
      title: 'Nightly sync',
      prompt: 'sync the rows',
      schedule: { type: 'daily', time: '09:00' },
      autoApprove: false,
      runMode: 'separate_task',
      agent: '',
      connectors: ['notion']
    })
    expect(created.title).toBe('Nightly sync')
    expect(created.status).toBe('active')
    expect(created.connectors).toEqual(['notion'])

    const updated = service.update(created.id, { title: 'Renamed' })
    expect(updated?.title).toBe('Renamed')

    expect(service.setStatus(created.id, 'paused')?.status).toBe('paused')
    expect(service.setStatus(created.id, 'active')?.status).toBe('active')

    expect(service.remove(created.id)).toBe(true)
    expect(service.get(created.id)).toBeNull()
  })

  it('refuses to resume an expired automation', () => {
    const { service, scheduler } = makeService()
    const created = service.create({
      kind: 'schedule',
      title: 'Expiring',
      prompt: 'do the thing',
      schedule: { type: 'daily', time: '09:00' },
      autoApprove: false,
      runMode: 'separate_task',
      agent: '',
      connectors: []
    })
    const routine = scheduler.list().find((r) => r.id === created.id)!
    routine.expiresAt = BASE.getTime() - 1000
    expect(() => service.setStatus(created.id, 'active')).toThrow(/expired/)
  })

  it('requires a prompt for a scheduled automation', () => {
    const { service } = makeService()
    expect(() => service.create({
      kind: 'schedule',
      title: 'No prompt',
      autoApprove: false,
      runMode: 'separate_task',
      agent: '',
      connectors: []
    })).toThrow(/prompt/)
  })
})

describe('automation IPC', () => {
  it('validates every payload at the boundary', () => {
    const handlers = new Map<string, (_event: unknown, payload?: unknown) => unknown>()
    const { service } = makeService()
    registerAutomationIpc(
      { handle: (channel, listener) => void handlers.set(channel, listener) },
      service,
      async () => []
    )

    expect(handlers.get('automation:list')!(null)).toMatchObject({ ok: true })
    expect(handlers.get('automation:get')!(null, { id: '' })).toMatchObject({ ok: false })
    expect(handlers.get('automation:create')!(null, { title: '' })).toMatchObject({ ok: false })
    expect(handlers.get('automation:update')!(null, { id: 'x' })).toMatchObject({ ok: false })
    expect(handlers.get('automation:delete')!(null, { id: 'nope' })).toMatchObject({ ok: false })
    expect(handlers.get('automation:pause')!(null, { id: 'nope' })).toMatchObject({ ok: false })
    expect(handlers.get('automation:resume')!(null, { id: 'nope' })).toMatchObject({ ok: false })
    expect(handlers.get('automation:test-run')!(null, { id: 'nope' })).toMatchObject({ ok: false })
  })
})
