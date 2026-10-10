import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  appOn: vi.fn(),
  appQuit: vi.fn(),
  buildFromTemplate: vi.fn((items: unknown[]) => items),
  openShellAppWindow: vi.fn(),
  getAllWindows: vi.fn(() => [] as Array<{ isDestroyed(): boolean; on: () => void }>),
  trayOn: vi.fn(),
  traySetContextMenu: vi.fn(),
  traySetToolTip: vi.fn(),
  trayInstance: {
    on: vi.fn(),
    setContextMenu: vi.fn(),
    setToolTip: vi.fn()
  }
}))

vi.mock('electron', () => ({
  app: {
    on: mocks.appOn,
    quit: mocks.appQuit,
    dock: { show: vi.fn(), hide: vi.fn() }
  },
  BrowserWindow: { getAllWindows: mocks.getAllWindows },
  Menu: { buildFromTemplate: mocks.buildFromTemplate },
  nativeImage: {
    createFromDataURL: vi.fn(() => ({})),
    createEmpty: vi.fn(() => ({}))
  },
  Tray: vi.fn(() => mocks.trayInstance)
}))

vi.mock('../../src/main/agent/shell-app-window.js', () => ({
  openShellAppWindow: mocks.openShellAppWindow
}))

import { createAppTray, hasOpenWindow } from '../../src/main/shell/app-lifecycle.js'

describe('app lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('keeps the Dock visible while any window remains open', () => {
    expect(hasOpenWindow([{ isDestroyed: () => false }])).toBe(true)
    expect(hasOpenWindow([{ isDestroyed: () => true }])).toBe(false)
  })

  it('creates the requested tray menu and opens the shell on tray click', () => {
    const openSettings = vi.fn()
    const values = { startOnLogin: false }
    const setStartOnLogin = vi.fn((enabled: boolean) => { values.startOnLogin = enabled })
    createAppTray(openSettings, () => values.startOnLogin, setStartOnLogin)
    const menu = mocks.buildFromTemplate.mock.calls.at(-1)?.[0] as Array<{
      label?: string
      click?: (item: { checked: boolean }) => void
    }>
    expect(menu.flatMap((item) => item.label ?? [])).toEqual([
      'Open app',
      'Settings',
      'Start on login',
      'Quit'
    ])
    menu.find((item) => item.label === 'Settings')?.click?.({ checked: false })
    expect(openSettings).toHaveBeenCalledOnce()
    menu.find((item) => item.label === 'Start on login')?.click?.({ checked: true })
    expect(setStartOnLogin).toHaveBeenCalledWith(true)
    const click = mocks.trayInstance.on.mock.calls.at(-1)?.[1]
    expect(click).toEqual(expect.any(Function))
    click()
    expect(mocks.openShellAppWindow).toHaveBeenCalledOnce()
  })
})
