import { describe, expect, it } from 'vitest'
import { getScheduleSource, registerScheduleSource } from '../../src/main/agent/schedule-registry.js'
import { listNotifications, notify } from '../../src/main/agent/notifications.js'
import { registerAutomationsIpc, registerShellIpc } from '../../src/main/agent/shell-ipc.js'
import type { NewNotification } from '../../src/shared/contracts/notifications.js'
import type { ScheduleSource } from '../../src/shared/contracts/schedule.js'
import { automationsApi } from '../../src/preload/automations.js'
import { shellApi } from '../../src/preload/shell.js'
import { IpcChannels } from '../../src/main/ipc.js'

describe('shell main-process contract modules', () => {
  it('replaces the registered schedule source', () => {
    const first: ScheduleSource = {
      listForDay: async () => [],
      listRecentRuns: async () => [],
      onChange: () => () => {}
    }
    const second: ScheduleSource = { ...first }
    registerScheduleSource(first)
    expect(getScheduleSource()).toBe(first)
    registerScheduleSource(second)
    expect(getScheduleSource()).toBe(second)
  })

  it('stores validated notifications newest-first and caps at 200', () => {
    const first = notify({ kind: 'info', title: 'First' })
    expect(first.read).toBe(false)
    expect(listNotifications()[0]?.id).toBe(first.id)
    expect(() => notify({ kind: 'not-a-kind', title: 'Invalid' } as unknown as NewNotification)).toThrow()
    for (let i = 0; i < 205; i++) notify({ kind: 'info', title: `Notice ${i}` })
    expect(listNotifications()).toHaveLength(200)
  })

  it('exposes the calendar action and callable IPC registration hooks', () => {
    expect(shellApi.openCalendarWindow).toEqual(expect.any(Function))
    expect(IpcChannels.calendarOpen).toBe('calendar:open')
    expect(automationsApi).toEqual({})
    expect(() => registerShellIpc()).not.toThrow()
    expect(() => registerAutomationsIpc()).not.toThrow()
  })
})
