import { beforeEach, describe, expect, it, vi } from 'vitest'

const fakes = vi.hoisted(() => {
  const sent: Array<{ channel: string; payload: unknown }> = []
  class FakeWindow {
    webContents = {
      on(): void {},
      once(): void {},
      send: (channel: string, ...args: unknown[]): void => {
        sent.push({ channel, payload: args[0] })
      }
    }
    show(): void {}
    focus(): void {}
    isDestroyed(): boolean {
      return false
    }
    once(): void {}
    on(): void {}
    loadURL(): void {}
  }
  return { sent, FakeWindow }
})

vi.mock('electron', () => ({
  app: { getAppPath: () => '/tmp', dock: undefined },
  BrowserWindow: fakes.FakeWindow
}))

vi.stubEnv('ELECTRON_RENDERER_URL', 'http://localhost:9999')

import { openCalendar, takePendingDraft } from '../../src/main/calendar-window.js'

describe('calendar draft hand-off (Step 0 cold-start race fix)', () => {
  beforeEach(() => {
    fakes.sent.length = 0
    // Drain any leftover draft so each test starts clean.
    takePendingDraft()
  })

  it('take returns null when nothing is pending', () => {
    expect(takePendingDraft()).toBeNull()
  })

  it('stash then take consumes exactly once', () => {
    openCalendar('buy milk Friday')
    expect(takePendingDraft()).toBe('buy milk Friday')
    expect(takePendingDraft()).toBeNull()
  })

  it('empty drafts are never stashed', () => {
    openCalendar('')
    openCalendar()
    expect(takePendingDraft()).toBeNull()
  })

  it('warm path still pushes immediately (take finds nothing)', () => {
    openCalendar('first') // creates the fake window
    takePendingDraft() // drain (ready-to-show never fires on the fake)
    fakes.sent.length = 0
    openCalendar('second') // window exists -> push path
    expect(fakes.sent).toEqual([{ channel: 'calendar:new-draft', payload: 'second' }])
    expect(takePendingDraft()).toBeNull()
  })

  it('stash/take round-trips 20 times without loss or duplication', () => {
    for (let i = 0; i < 20; i++) {
      // Fresh window state is not needed: take-once is what we exercise.
      openCalendar(`draft-${i}`)
      // If the window already exists the push path fires; drain-safe take:
      const taken = takePendingDraft()
      const pushed = fakes.sent.some(
        (s) => s.channel === 'calendar:new-draft' && s.payload === `draft-${i}`
      )
      // Exactly one delivery channel must have the draft, never both, never none.
      expect((taken === `draft-${i}`) !== pushed).toBe(true)
      expect(takePendingDraft()).toBeNull()
      fakes.sent.length = 0
    }
  })
})
