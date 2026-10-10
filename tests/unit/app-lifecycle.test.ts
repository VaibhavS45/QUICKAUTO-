import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  appOn: vi.fn(),
  appQuit: vi.fn(),
  buildFromTemplate: vi.fn((items: unknown[]) => items),
  openShellAppWindow: vi.fn(),
  getAllWindows: vi.fn(() => [] as Array<{ isDestroyed(): boolean; isVisible(): boolean; on: () => void }>),
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

import { createAppTray, hasVisibleWindow, startAppLaunch } from '../../src/main/agent/app-lifecycle.js'

describe('app lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('opens the shell by default and on app activation', () => {
    startAppLaunch(['palette'])
    expect(mocks.openShellAppWindow).toHaveBeenCalledOnce()
    expect(mocks.appOn).toHaveBeenCalledWith('activate', expect.any(Function))
  })

  it('keeps --background startup tray-only', () => {
    startAppLaunch(['palette', '--background'])
    expect(mocks.openShellAppWindow).not.toHaveBeenCalled()
    expect(mocks.appOn).toHaveBeenCalledWith('activate', expect.any(Function))
  })

  it('shows the Dock only for a live visible window', () => {
    expect(hasVisibleWindow([{ isDestroyed: () => false, isVisible: () => true }])).toBe(true)
    expect(hasVisibleWindow([{ isDestroyed: () => true, isVisible: () => true }])).toBe(false)
    expect(hasVisibleWindow([{ isDestroyed: () => false, isVisible: () => false }])).toBe(false)
  })

  it('creates the requested tray menu and opens the shell on tray click', () => {
    const openCalendar = vi.fn()
    const openSettings = vi.fn()
    createAppTray(openCalendar, openSettings)
    const menu = mocks.buildFromTemplate.mock.calls.at(-1)?.[0] as Array<{
      label?: string
      click?: () => void
    }>
    expect(menu.flatMap((item) => item.label ?? [])).toEqual([
      'Open app',
      'Open calendar',
      'Settings',
      'Quit'
    ])
    menu.find((item) => item.label === 'Open calendar')?.click?.()
    menu.find((item) => item.label === 'Settings')?.click?.()
    expect(openCalendar).toHaveBeenCalledOnce()
    expect(openSettings).toHaveBeenCalledOnce()
    const click = mocks.trayInstance.on.mock.calls.at(-1)?.[1]
    expect(click).toEqual(expect.any(Function))
    click()
    expect(mocks.openShellAppWindow).toHaveBeenCalledOnce()
  })
})
