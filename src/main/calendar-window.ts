import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { preloadPath } from './palette-window.js'

let win: BrowserWindow | null = null
let pendingDraft: string | null = null

export function getCalendarWindow(): BrowserWindow | null {
  return win
}

/** @calendar never runs an agent — it opens this window with a task draft. */
export function openCalendar(draft?: string): void {
  // ponytail: single place all callers route through — Dock + focus here, not per caller.
  if (process.platform === 'darwin' && app.dock) app.dock.show()
  if (typeof draft === 'string' && draft.length > 0) pendingDraft = draft
  if (win && !win.isDestroyed()) {
    if (pendingDraft) {
      win.webContents.send('calendar:new-draft', pendingDraft)
      pendingDraft = null
    }
    win.show()
    win.focus()
    return
  }
  win = new BrowserWindow({
    title: 'CalTen — Automations',
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    // macOS: hidden title bar like the reference shot (traffic lights float over content).
    // Elsewhere: native frame so minimize/maximize/close + title always exist.
    frame: process.platform !== 'darwin',
    titleBarStyle: process.platform === 'darwin' ? 'hidden' : 'default',
    trafficLightPosition: process.platform === 'darwin' ? { x: 12, y: 12 } : undefined,
    resizable: true,
    movable: true,
    minimizable: true,
    maximizable: true,
    fullscreenable: true,
    backgroundColor: '#000000',
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`Calendar renderer failed to load (${errorCode}): ${errorDescription} - ${validatedURL}`)
  })
  win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.error(`Calendar renderer console [${level}] ${sourceId}:${line}: ${message}`)
  })

  const load = (): void => {
    if (!win) return
    if (process.env['ELECTRON_RENDERER_URL']) {
      const base = process.env['ELECTRON_RENDERER_URL'].replace(/\/$/, '')
      void win.loadURL(`${base}/index.html#calendar`)
    } else {
      void win.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'calendar' })
    }
  }
  load()

  win.once('ready-to-show', () => {
    win?.show()
    if (pendingDraft && win) {
      win.webContents.send('calendar:new-draft', pendingDraft)
      pendingDraft = null
    }
  })

  // macOS: showing the calendar restores the Dock icon (see index.ts).
  win.on('closed', () => {
    win = null
  })
}

// Step 0 (fix/palette-pop) calendar hand-off — the ONLY change this task makes
// to a calendar-owned file: the ready-to-show push above can fire before the
// calendar renderer mounts its 'calendar:new-draft' listener (cold start), so
// the renderer also pulls via 'calendar:take-draft' on mount. Take-once keeps
// push and pull from double-delivering the same draft.
/** Return the pending @calendar draft and clear it (single consumption). */
export function takePendingDraft(): string | null {
  const draft = pendingDraft
  pendingDraft = null
  return draft
}
