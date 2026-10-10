import { app, BrowserWindow, Menu, nativeImage, Tray } from 'electron'
import { shouldAutoOpenApp } from './background-mode.js'
import { openShellAppWindow } from './shell-app-window.js'

let tray: Tray | null = null

export function createAppTray(openCalendar: () => unknown, openSettings: () => unknown): Tray {
  const icon =
    nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAAAFElEQVR42mP8z8AARQMTEwMTAwMAJBYAAWzRRf4AAAAASUVORK5CYII='
    ) || nativeImage.createEmpty()
  tray = new Tray(icon)
  tray.setToolTip('Palette')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open app', click: () => openShellAppWindow() },
      { label: 'Open calendar', click: () => openCalendar() },
      { label: 'Settings', click: () => openSettings() },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
    ])
  )
  tray.on('click', () => openShellAppWindow())
  return tray
}

export function watchDockVisibility(): void {
  if (process.platform !== 'darwin' || !app.dock) return

  const update = (): void => {
    if (hasVisibleWindow(BrowserWindow.getAllWindows())) app.dock?.show()
    else app.dock?.hide()
  }
  const watchWindow = (window: BrowserWindow): void => {
    window.on('show', update)
    window.on('hide', update)
    window.on('closed', () => setImmediate(update))
  }
  BrowserWindow.getAllWindows().forEach(watchWindow)
  app.on('browser-window-created', (_event, window) => watchWindow(window))
  update()
}

export function hasVisibleWindow(windows: Array<Pick<BrowserWindow, 'isDestroyed' | 'isVisible'>>): boolean {
  return windows.some((window) => !window.isDestroyed() && window.isVisible())
}

export function startAppLaunch(argv: string[]): void {
  if (shouldAutoOpenApp(argv)) openShellAppWindow()
  app.on('activate', () => openShellAppWindow())
}
