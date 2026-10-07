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
let lastToggleSignalAt: number | null = null
/**
 * Wayland focus guard: compositors routinely deny focus-stealing, so a
 * freshly shown palette may fire `blur` without ever having focus. Only
 * auto-hide on blur when the window actually held focus; Esc/explicit
 * hidePalette() calls are unaffected.
 */
let hadFocus = false
/**
 * Spurious blurs fire within milliseconds of show() when the compositor
 * withholds activation. Blurs after GRACE_MS are real (user clicked
 * elsewhere) and always hide — even if Electron never saw 'focus'.
 */
const BLUR_GRACE_MS = 500
let shownAt = 0

/** QUICKAUTO_DEBUG=1 latency probe: mark when a --toggle signal arrived. */
export function noteToggleSignal(): void {
  lastToggleSignalAt = Date.now()
}

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
    title: 'QUICKauto',
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

  win.on('focus', () => {
    hadFocus = true
  })

  win.on('blur', () => {
    // Esc or blur hides it (spec). Don't hide while devtools open.
    if (process.env['QUICKAUTO_DEBUG'] === '1') {
      process.stderr.write(
        `[quickauto-debug] palette blur event (hadFocus=${hadFocus}, ageMs=${Date.now() - shownAt})\n`
      )
    }
    // Ignore the spurious blur when focus was never granted right after show
    // (Wayland withholds activation); otherwise the palette hides the instant
    // it appears. Any later blur means "clicked somewhere else" -> hide.
    if (!hadFocus && Date.now() - shownAt < BLUR_GRACE_MS) return
    hadFocus = false
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
  hadFocus = false // reset: a later blur only hides if focus was really granted
  shownAt = Date.now()
  const active = BrowserWindow.getFocusedWindow()
  if (active && active !== win) lastFocusedWindowId = active.id
  const { x, y } = centerOnCursor()
  win.setPosition(x, y)
  win.show()
  // Hyprland/Wayland: show() alone may leave the surface unfocused; the O3
  // window rules (float + pin + stay focused) pair with this explicit focus.
  win.focus()
  win.webContents.send('palette:opened')
  if (process.env['QUICKAUTO_DEBUG'] === '1' && lastToggleSignalAt !== null) {
    process.stderr.write(
      `[quickauto-debug] palette shown in ${Date.now() - lastToggleSignalAt}ms (signal -> show)\n`
    )
  }
  lastToggleSignalAt = null
}

export function hidePalette(restoreFocus: boolean): void {
  if (!win || win.isDestroyed()) return
  if (process.env['QUICKAUTO_DEBUG'] === '1') {
    process.stderr.write(
      `[quickauto-debug] hidePalette (restoreFocus=${restoreFocus}) trace: ${new Error().stack?.split('\n').slice(2, 5).join(' <- ')}\n`
    )
  }
  win.hide()
  hadFocus = false
  if (restoreFocus && process.platform === 'win32' && lastFocusedWindowId !== null) {
    const prev = BrowserWindow.fromId(lastFocusedWindowId)
    // Windows: restore focus to the previously active window on hide.
    if (prev && !prev.isDestroyed()) prev.focus()
    lastFocusedWindowId = null
  }
}

export function togglePalette(): void {
  if (!win || win.isDestroyed()) return
  if (process.env['QUICKAUTO_DEBUG'] === '1') {
    process.stderr.write(`[quickauto-debug] togglePalette (visible=${win.isVisible()})\n`)
  }
  if (win.isVisible()) hidePalette(true)
  else showPalette()
}

export function isPaletteVisible(): boolean {
  return !!win && !win.isDestroyed() && win.isVisible()
}
