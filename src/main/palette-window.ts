import { app, BrowserWindow, screen } from 'electron'
import { existsSync } from 'node:fs'
import { join } from 'path'
import { clampPaletteHeight, PALETTE_MAX_HEIGHT, PALETTE_MIN_HEIGHT, PALETTE_WIDTH } from '../shared/agent.js'

export { PALETTE_WIDTH, PALETTE_MIN_HEIGHT, PALETTE_MAX_HEIGHT }

/**
 * Preload must be CJS for the sandboxed renderer loader.
 * scripts/build-preload.mjs emits out/preload/index.cjs (also used in dev).
 */
export function preloadPath(): string {
  const candidates = [
    join(__dirname, '../../preload/index.cjs'),
    join(app.getAppPath(), 'preload/index.cjs'),
    join(__dirname, '../preload/index.mjs'),
    join(__dirname, '../preload/index.js')
  ]
  return candidates.find((p) => existsSync(p)) ?? candidates[0]!
}

let win: BrowserWindow | null = null
let lastFocusedWindowId: number | null = null

function rendererUrl(page: string): string {
  if (process.env['ELECTRON_RENDERER_URL']) {
    return `${process.env['ELECTRON_RENDERER_URL'].replace(/\/$/, '')}/${page}`
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
    // Explicit min/max so Linux/Hyprland compositors honor the dynamic height.
    minWidth: PALETTE_WIDTH,
    maxWidth: PALETTE_WIDTH,
    minHeight: PALETTE_MIN_HEIGHT,
    maxHeight: PALETTE_MAX_HEIGHT,
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
    // ponytail: no blur-hide in dev, the window would vanish while inspecting.
    if (process.env['ELECTRON_RENDERER_URL']) return
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
  // ponytail: key-window steal; win.focus() alone doesn't activate the app on macOS.
  // app.show() reverses the app.hide() done in hidePalette (background mode).
  if (process.platform === 'darwin') {
    app.show()
    app.focus({ steal: true })
  }
  win.show()
  win.focus()
  win.webContents.send('palette:opened')
}

export function hidePalette(restoreFocus: boolean): void {
  if (!win || win.isDestroyed()) return
  win.hide()
  // Raycast behavior on macOS: deactivate the app so focus returns to the
  // previous app. Only when no other window (calendar) is visible — app.hide()
  // hides everything, so never call it while the calendar is open.
  // ponytail: BrowserWindow count instead of importing calendar-window (would cycle).
  if (process.platform === 'darwin') {
    const others = BrowserWindow.getAllWindows().filter(
      (w) => w !== win && !w.isDestroyed() && w.isVisible()
    )
    if (others.length === 0) app.hide()
    return
  }
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

/**
 * Grow/shrink the palette to fit content. Called from the renderer's
 * ResizeObserver over a zod-validated IPC channel. Height is clamped to
 * [MIN, MAX] so a long result list can never cover the screen.
 */
export function resizePaletteToContent(requestedHeight: number): number {
  if (!win || win.isDestroyed()) return PALETTE_MIN_HEIGHT
  const height = clampPaletteHeight(requestedHeight)
  const [w] = win.getContentSize()
  if (w !== PALETTE_WIDTH || win.getContentBounds().height !== height) {
    win.setContentSize(PALETTE_WIDTH, height)
  }
  return height
}
