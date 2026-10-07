import { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, nativeImage, session, Notification } from 'electron'
import Store from 'electron-store'
import {
  createPaletteWindow,
  showPalette,
  hidePalette,
  togglePalette,
  getPaletteWindow,
  noteToggleSignal
} from './palette-window.js'
import { openCalendar, getCalendarWindow } from './calendar-window.js'
import {
  IpcChannels,
  PaletteSubmitSchema,
  CalendarDraftSchema,
  SetHotkeySchema,
  PlatformInfoSchema,
  type PlatformInfo
} from './ipc.js'
import { defaultHotkey, toPaletteSubmit } from '../shared/types.js'
import { wantsToggle, coldStartVisibility } from '../shared/startup.js'
import { detectHyprland, electronHotkeyToHypr, hyprBindSnippet } from '../shared/hypr.js'

// Stable Linux identity: predictable Wayland app_id / X11 WM_CLASS.
// Must run before app.ready. electron-store's data dir follows this name
// (~/.config/quickauto); no migration needed at M1 (fresh rename).
app.setName('quickauto')

// Prefer native Wayland when available (harmless elsewhere). Electron 44
// already defaults to --ozone-platform=wayland on this machine; the hint
// keeps dev/X11-fallback behavior predictable.
app.commandLine.appendSwitch('ozone-platform-hint', 'auto')

/** Debug timing for `--toggle` latency (QUICKAUTO_DEBUG=1): signal -> shown. */
function debugLog(message: string): void {
  if (process.env['QUICKAUTO_DEBUG'] === '1') {
    process.stderr.write(`[quickauto-debug] ${message}\n`)
  }
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) app.quit()

const store = new Store<{ hotkey: string; openAtLogin: boolean }>({
  defaults: { hotkey: defaultHotkey(process.platform), openAtLogin: false }
})

let tray: Tray | null = null
let hotkeyError: string | null = null

// Cold-start policy (O1): a `--toggle` launch must never do nothing. If this
// process is the first instance AND was started with --toggle, show the
// palette once ready. Plain launches (autostart) stay hidden in the tray.
const coldStart = coldStartVisibility(process.argv)

// Second-instance (quickauto --toggle CLI) routes through the single-instance lock.
app.on('second-instance', (_event, argv) => {
  if (wantsToggle(argv)) {
    noteToggleSignal()
    debugLog('second-instance --toggle received')
    togglePalette()
  } else {
    noteToggleSignal()
    showPalette()
  }
})

function sessionType(): string {
  return process.env['XDG_SESSION_TYPE'] ?? (process.platform === 'linux' ? 'unknown' : 'n/a')
}

function isHyprland(): boolean {
  return detectHyprland({
    HYPRLAND_INSTANCE_SIGNATURE: process.env['HYPRLAND_INSTANCE_SIGNATURE'],
    XDG_CURRENT_DESKTOP: process.env['XDG_CURRENT_DESKTOP']
  })
}

/**
 * Exact command a system shortcut must run for --toggle.
 * Packaged builds: the real executable path. Dev (`electron <app>`):
 * `electron <app-path> --toggle`.
 */
export function toggleCommand(): string {
  if (app.isPackaged) return `${process.execPath} --toggle`
  return `electron ${app.getAppPath()} --toggle`
}

function platformInfo(): PlatformInfo {
  const st = sessionType()
  const wayland = process.platform === 'linux' && st === 'wayland'
  const info: PlatformInfo = {
    platform: process.platform,
    sessionType: st,
    wayland,
    // globalShortcut is unreliable on Wayland (Electron docs / portal path).
    globalShortcutReliable: !wayland,
    hyprland: isHyprland(),
    toggleCommand: toggleCommand()
  }
  // Fail loud in dev if the contract drifts; never crash in production.
  const parsed = PlatformInfoSchema.safeParse(info)
  if (!parsed.success) debugLog(`platformInfo schema drift: ${parsed.error.message}`)
  return info
}

function waylandToggleHint(): string {
  const cmd = toggleCommand()
  if (isHyprland()) {
    // Omarchy 4 uses Lua config (~/.config/hypr/bindings.lua); older setups
    // use `bind = MOD, KEY, exec, <cmd>` in hyprland.conf. The Settings panel
    // shows the Lua line with a Copy button; both are printed here for logs.
    const hotkey = store.get('hotkey', defaultHotkey(process.platform))
    const lua = hyprBindSnippet(electronHotkeyToHypr(hotkey), cmd, 'lua')
    return (
      `Global hotkeys don't work reliably on Wayland, so the hotkey was not registered.\n\n` +
      `Hyprland fallback — add to ~/.config/hypr/bindings.lua (managed block or manual):\n${lua}\n\n` +
      `Classic hyprland.conf fallback:\nbind = <MOD>, <KEY>, exec, ${cmd}`
    )
  }
  return (
    `Global hotkeys don't work reliably on Wayland, so the hotkey was not registered.\n\n` +
    `Fallback: bind a system shortcut in your desktop settings (GNOME: Settings → Keyboard → Custom Shortcut, ` +
    `KDE: System Settings → Shortcuts) to run:\n${cmd}`
  )
}

function registerHotkey(hotkey: string): boolean {
  globalShortcut.unregisterAll()
  try {
    const ok = globalShortcut.register(hotkey, () => togglePalette())
    if (!ok) {
      hotkeyError =
        process.platform === 'linux' && platformInfo().wayland
          ? waylandToggleHint()
          : `Could not register hotkey "${hotkey}". It may be in use by another app. ` +
            `Pick a different hotkey in Settings, or run with --toggle.`
      getPaletteWindow()?.webContents.send(IpcChannels.hotkeyError, hotkeyError)
      return false
    }
    hotkeyError = null
    return true
  } catch (err) {
    hotkeyError = `Could not register hotkey "${hotkey}": ${String(err)}`
    getPaletteWindow()?.webContents.send(IpcChannels.hotkeyError, hotkeyError)
    return false
  }
}

function applyAutostart(): void {
  const openAtLogin = store.get('openAtLogin', false)
  app.setLoginItemSettings({ openAtLogin })
}

function createTray(): void {
  try {
    const icon = nativeImage.createEmpty()
    tray = new Tray(icon)
    tray.setToolTip('QUICKauto')
    const menu = Menu.buildFromTemplate([
      { label: 'Open palette', click: () => showPalette() },
      { label: 'Open calendar', click: () => openCalendar() },
      {
        label: 'Settings',
        click: () => {
          showPalette()
          getPaletteWindow()?.webContents.send('settings:open')
        }
      },
      { type: 'separator' },
      {
        label: 'Start on login',
        type: 'checkbox',
        checked: store.get('openAtLogin', false),
        click: (item) => {
          store.set('openAtLogin', item.checked)
          applyAutostart()
        }
      },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
    ])
    tray.setContextMenu(menu)
    tray.on('click', () => togglePalette())
  } catch (err) {
    // Headless / no StatusNotifier host (e.g. Waybar tray missing): stay alive
    // on --toggle. One line, no crash.
    debugLog(`tray unavailable, continuing without it: ${String(err)}`)
    tray = null
  }
}

function applyStrictCsp(): void {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const dev = !!process.env['ELECTRON_RENDERER_URL']
    const csp = dev
      ? `default-src 'self' 'unsafe-inline' 'unsafe-eval' data: http://localhost:* ws://localhost:*; script-src 'self' 'unsafe-inline' 'unsafe-eval' http://localhost:*; style-src 'self' 'unsafe-inline' http://localhost:*; img-src 'self' data: blob:; font-src 'self' data:;`
      : `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:;`
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp]
      }
    })
  })
}

function wireIpc(): void {
  ipcMain.handle(IpcChannels.platformInfo, (): PlatformInfo => platformInfo())

  ipcMain.handle(IpcChannels.getHotkey, () => ({
    hotkey: store.get('hotkey', defaultHotkey(process.platform)),
    error: hotkeyError
  }))

  ipcMain.handle(IpcChannels.setHotkey, (_event, payload: unknown) => {
    const parsed = SetHotkeySchema.safeParse(payload)
    if (!parsed.success) return { ok: false, error: 'Invalid hotkey format.' }
    store.set('hotkey', parsed.data.hotkey)
    const ok = registerHotkey(parsed.data.hotkey)
    return { ok, error: ok ? null : hotkeyError }
  })

  ipcMain.on(IpcChannels.paletteHide, () => hidePalette(true))

  ipcMain.handle(IpcChannels.paletteSubmit, (_event, payload: unknown) => {
    const parsed = PaletteSubmitSchema.safeParse(payload)
    if (!parsed.success) return { ok: false as const, error: 'Invalid request.' }
    const submit = toPaletteSubmit(parsed.data.text)

    // @calendar never runs an agent — it opens the calendar with a draft.
    if (submit.tools.includes('calendar')) {
      const draft = parsed.data.text.replace(/@calendar\s*/i, '').trim()
      const draftParsed = CalendarDraftSchema.safeParse({ text: draft })
      openCalendar(draftParsed.success ? draftParsed.data.text : '')
      // macOS: showing the calendar restores the Dock icon.
      if (process.platform === 'darwin' && app.dock) app.dock.show()
      hidePalette(false)
      return { ok: true as const, action: 'calendar', tools: submit.tools }
    }

    // M1: no agent yet. Renderer shows this placeholder under the input.
    return {
      ok: true as const,
      action: 'placeholder',
      tools: submit.tools,
      message:
        submit.tools.length === 0
          ? 'Agent loop lands in Milestone 2. For now try @ to see the tool list, or @calendar <text> to open a task draft.'
          : `Agent loop lands in Milestone 2 — would have used: ${submit.tools.map((t) => `@${t}`).join(', ')}.`
    }
  })

  ipcMain.on('calendar:opened-with-window', () => {
    if (process.platform === 'darwin' && app.dock) app.dock.show()
  })
  ipcMain.on('calendar:closed-to-tray', () => {
    // macOS: back to accessory-style when only palette/tray remain.
    if (process.platform === 'darwin' && app.dock && !getCalendarWindow()) app.dock.hide()
  })
}

async function onReady(): Promise<void> {
  applyStrictCsp()
  const palette = createPaletteWindow()
  wireIpc()
  createTray()
  applyAutostart()

  // Cold start via --toggle (O1): a hotkey press must never do nothing. Show
  // once the renderer finished loading (with a fallback timer in case the
  // load event is missed). Plain launches stay hidden in the tray.
  if (coldStart === 'show') {
    noteToggleSignal()
    debugLog('cold start with --toggle: will show palette once ready')
    let shown = false
    const showOnce = (): void => {
      if (shown) return
      shown = true
      showPalette()
    }
    palette.webContents.once('did-finish-load', showOnce)
    setTimeout(showOnce, 3000).unref?.()
  }

  const hotkey = store.get('hotkey', defaultHotkey(process.platform))
  const registered = registerHotkey(hotkey)
  if (!registered && platformInfo().wayland) {
    new Notification({
      title: 'QUICKauto: hotkey unavailable on Wayland',
      body: 'Bind a system shortcut to quickauto --toggle. See Settings for the exact command.'
    }).show()
  }

  // macOS: hide the Dock icon while only the palette is open.
  if (process.platform === 'darwin' && app.dock) app.dock.hide()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createPaletteWindow()
  })
}

app.whenReady().then(() => void onReady())

// Keep running in the tray after windows close so schedules can fire (M4).
app.on('window-all-closed', () => {
  // Do not quit — tray keeps the app alive.
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})

export { store }
