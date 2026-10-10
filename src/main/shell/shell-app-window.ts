import { app, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { preloadPath } from '../preload-path.js'

let win: BrowserWindow | null = null

export function getShellAppWindow(): BrowserWindow | null {
  return win
}

export function openShellAppWindow(): BrowserWindow {
  if (process.platform === 'darwin' && app.dock) app.dock.show()
  if (win && !win.isDestroyed()) {
    win.show()
    win.focus()
    return win
  }
  win = new BrowserWindow({
    title: 'Palette',
    width: 1200,
    height: 780,
    minWidth: 900,
    minHeight: 600,
    show: false,
    frame: process.platform !== 'darwin',
    titleBarStyle: process.platform === 'darwin' ? 'hidden' : 'default',
    trafficLightPosition: process.platform === 'darwin' ? { x: 12, y: 12 } : undefined,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  if (process.env['ELECTRON_RENDERER_URL']) {
    const base = process.env['ELECTRON_RENDERER_URL'].replace(/\/$/, '')
    void win.loadURL(`${base}/index.html#app`)
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'app' })
  }
  win.once('ready-to-show', () => win?.show())
  win.on('closed', () => {
    win = null
  })
  return win
}
