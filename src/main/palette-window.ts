import { app, BrowserWindow, screen } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'path'

export const PALETTE_WIDTH = 720
export const PALETTE_MIN_HEIGHT = 120

/**
 * Preload must be CJS for the sandboxed renderer loader.
 * scripts/build-preload.mjs emits out/preload/index.cjs (also used in dev).
 */
export function preloadPath(): string {
  const candidates = [
    join(__dirname, '../preload/index.cjs'),
    join(app.getAppPath(), 'out/preload/index.cjs'),
    join(__dirname, '../preload/index.mjs'),
    join(__dirname, '../preload/index.js')
  ]
  return candidates.find((p) => existsSync(p)) ?? candidates[0]!
}

let win: BrowserWindow | null = null
let lastFocusedWindowId: number | null = null

function rendererUrl(page: string): string {
  if (process.env['ELECTRON_RENDERER_URL']) {
    return `${process.env['ELECTRON_RENDERER_URL']}/${page}`
  }
  return join(__dirname, `../renderer/${page}`)
}

export function getPaletteWindow(): BrowserWindow | null {
  return win
}

/** Create once at startup, hidden. Show/hide is instant afterwards (<150ms target). */
export function createPaletteWindow(): BrowserWindow {
  win = new BrowserWindow({
    width: PALETTE_WIDTH,
    height: PALETTE_MIN_HEIGHT,
    show: false,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hiddenInMissionControl: true,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  const isMac = process.platform === 'darwin'
  if (isMac) {
    // Float above full-screen apps.
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  } else {
    win.setVisibleOnAllWorkspaces(true)
  }

  const page = 'index.html'
  if (process.env['ELECTRON_RENDERER_URL']) {
    void win.loadURL(`${rendererUrl(page)}#palette`)
  } else {
    void win.loadFile(rendererUrl(page), { hash: 'palette' })
  }

  win.on('blur', () => {
    // Esc or blur hides it (spec). Don't hide while devtools open.
    if (win && !win.webContents.isDevToolsOpened()) hidePalette(false)
  })

  win.on('closed', () => {
    win = null
  })

  return win
}

function centerOnCursor(): { x: number; y: number } {
  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  const { width } = display.workAreaSize
  const x = Math.round(display.workArea.x + (width - PALETTE_WIDTH) / 2)
  const y = Math.round(display.workArea.y + 120)
  return { x, y }
}

export function showPalette(): void {
  if (!win) return
  const active = BrowserWindow.getFocusedWindow()
  if (active && active !== win) lastFocusedWindowId = active.id
  const { x, y } = centerOnCursor()
  win.setPosition(x, y)
  win.show()
  win.focus()
  win.webContents.send('palette:opened')
}

export function hidePalette(restoreFocus: boolean): void {
  if (!win || win.isDestroyed()) return
  win.hide()
  if (restoreFocus && process.platform === 'win32' && lastFocusedWindowId !== null) {
    const prev = BrowserWindow.fromId(lastFocusedWindowId)
    // Windows: restore focus to the previously active window on hide.
    if (prev && !prev.isDestroyed()) prev.focus()
    lastFocusedWindowId = null
  }
}

export function togglePalette(): void {
  if (!win || win.isDestroyed()) return
  if (win.isVisible()) hidePalette(true)
  else showPalette()
}

export function isPaletteVisible(): boolean {
  return !!win && !win.isDestroyed() && win.isVisible()
}
