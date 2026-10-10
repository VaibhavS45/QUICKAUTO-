import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { preloadPath } from '../preload-path.js'
import {
  SETTINGS_HEIGHT,
  SETTINGS_MIN_HEIGHT,
  SETTINGS_MIN_WIDTH,
  SETTINGS_WIDTH
} from './settings-layout.js'

export { SETTINGS_HEIGHT, SETTINGS_MIN_HEIGHT, SETTINGS_MIN_WIDTH, SETTINGS_WIDTH }

let win: BrowserWindow | null = null

export function getSettingsWindow(): BrowserWindow | null {
  return win
}

function loadSettings(target: BrowserWindow, tab?: string): void {
  const hash = tab ? `settings?tab=${encodeURIComponent(tab)}` : 'settings'
  if (process.env['ELECTRON_RENDERER_URL']) {
    const base = process.env['ELECTRON_RENDERER_URL'].replace(/\/$/, '')
    void target.loadURL(`${base}/index.html#${hash}`)
    return
  }
  void target.loadFile(join(__dirname, '../renderer/index.html'), { hash })
}

/** Dedicated settings window (Cursor-style). Created on first open so smoke stays 2 windows. */
export function openSettings(tab?: string): BrowserWindow {
  if (process.platform === 'darwin' && app.dock) app.dock.show()
  if (win && !win.isDestroyed()) {
    if (tab) win.webContents.send('settings:open', tab)
    win.show()
    win.focus()
    return win
  }
  win = new BrowserWindow({
    title: 'Settings',
    width: SETTINGS_WIDTH,
    height: SETTINGS_HEIGHT,
    minWidth: SETTINGS_MIN_WIDTH,
    minHeight: SETTINGS_MIN_HEIGHT,
    show: false,
    frame: process.platform !== 'darwin',
    titleBarStyle: process.platform === 'darwin' ? 'hidden' : 'default',
    trafficLightPosition: process.platform === 'darwin' ? { x: 16, y: 14 } : undefined,
    resizable: true,
    movable: true,
    minimizable: true,
    maximizable: true,
    fullscreenable: false,
    backgroundColor: '#0c0c0e',
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  loadSettings(win, tab)

  win.once('ready-to-show', () => {
    win?.show()
    win?.focus()
  })

  win.on('closed', () => {
    win = null
  })

  return win
}

export function hideSettings(): void {
  if (!win || win.isDestroyed()) return
  win.close()
}
