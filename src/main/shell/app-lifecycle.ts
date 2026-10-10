import { app, BrowserWindow, Menu, nativeImage, Tray } from 'electron'
import { openShellAppWindow } from '../agent/shell-app-window.js'

let tray: Tray | null = null

export function createAppTray(
  openSettings: () => unknown,
  getStartOnLogin: () => boolean,
  setStartOnLogin: (enabled: boolean) => void
): Tray {
  const icon =
    nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAAAFElEQVR42mP8z8AARQMTEwMTAwMAJBYAAWzRRf4AAAAASUVORK5CYII='
    ) || nativeImage.createEmpty()
  tray = new Tray(icon)
  tray.setToolTip('Palette')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open app', click: () => openShellAppWindow() },
      { label: 'Settings', click: () => openSettings() },
      {
        label: 'Start on login',
        type: 'checkbox',
        checked: getStartOnLogin(),
        click: (item) => setStartOnLogin(item.checked)
      },
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
    if (hasOpenWindow(BrowserWindow.getAllWindows())) app.dock?.show()
    else app.dock?.hide()
  }
  const watchWindow = (window: BrowserWindow): void => {
    window.on('closed', () => setImmediate(update))
  }
  BrowserWindow.getAllWindows().forEach(watchWindow)
  app.on('browser-window-created', (_event, window) => {
    watchWindow(window)
    update()
  })
  update()
}

export function hasOpenWindow(windows: Array<Pick<BrowserWindow, 'isDestroyed'>>): boolean {
  return windows.some((window) => !window.isDestroyed())
}
