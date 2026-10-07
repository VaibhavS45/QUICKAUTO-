import { BrowserWindow } from 'electron'
import { join } from 'path'
import { preloadPath } from './palette-window.js'

let win: BrowserWindow | null = null
let pendingDraft: string | null = null

export function getCalendarWindow(): BrowserWindow | null {
  return win
}

/** @calendar never runs an agent — it opens this window with a task draft. */
export function openCalendar(draft?: string): void {
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
    width: 1100,
    height: 750,
    minWidth: 800,
    minHeight: 550,
    show: false,
    title: 'QUICKauto Calendar',
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
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

export function takePendingDraft(): string | null {
  const d = pendingDraft
  pendingDraft = null
  return d
}
