import { app, BrowserWindow, Tray, Menu, globalShortcut, ipcMain, nativeImage, session, Notification, safeStorage, shell } from 'electron'
import Store from 'electron-store'
import { randomUUID } from 'node:crypto'
import {
  createPaletteWindow,
  showPalette,
  hidePalette,
  togglePalette,
  getPaletteWindow,
  resizePaletteToContent
} from './palette-window.js'
import { openCalendar, getCalendarWindow } from './calendar-window.js'
import {
  IpcChannels,
  PaletteSubmitSchema,
  CalendarDraftSchema,
  SetHotkeySchema,
  ApiKeySchema,
  AgentCancelSchema,
  AgentRunRequestSchema,
  AgentApprovalResponseSchema,
  PaletteResizeSchema,
  ModelSettingsSchema,
  ConnectionToolSchema,
  type PlatformInfo
} from './ipc.js'
import { defaultHotkey, toPaletteSubmit, TOOL_IDS, type ToolId } from '../shared/types.js'
import type { AgentEvent } from '../shared/agent.js'
import { runAgent, type ApprovalDecision } from './agent/runner.js'
import { ModelSettingsService, type SettingsStore } from './settings/model-settings.js'
import { SecretVault, COMPOSIO_API_KEY_NAME } from './settings/secret-vault.js'
import { registerConnectorProvider } from './agent/registry.js'
import { ComposioConnectorProvider } from './connectors/composio.js'
import { GitHubCliProvider, validateRepoEntry } from './connectors/github-cli.js'
import { BudgetGuard, type BudgetStore, type BudgetUsageState } from './connectors/budget-guard.js'

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) app.quit()

const store = new Store<{ hotkey: string; openAtLogin: boolean }>({
  defaults: { hotkey: defaultHotkey(process.platform), openAtLogin: false }
})

class ElectronSettingsStore implements SettingsStore {
  get(key: string): unknown {
    return (store as unknown as { get: (k: string) => unknown }).get(key)
  }
  set(key: string, value: unknown): void {
    ;(store as unknown as { set: (k: string, v: unknown) => void }).set(key, value)
  }
}

const budgetFile = new Store<{ usage: BudgetUsageState | null }>({
  name: 'palette-budget',
  defaults: { usage: null }
})

class ElectronBudgetStore implements BudgetStore {
  load(): BudgetUsageState | null {
    return budgetFile.get('usage', null)
  }
  save(state: BudgetUsageState): void {
    budgetFile.set('usage', state)
  }
}

const safeStorageLike = {
  isAsyncEncryptionAvailable: () => safeStorage.isAsyncEncryptionAvailable(),
  encryptStringAsync: (s: string) => safeStorage.encryptStringAsync(s),
  decryptStringAsync: (b: Buffer) => safeStorage.decryptStringAsync(b)
}

const settingsService = new ModelSettingsService(new ElectronSettingsStore(), safeStorageLike)
const secretVault = new SecretVault(new ElectronSettingsStore(), safeStorageLike)

const composioProvider = new ComposioConnectorProvider({
  getApiKey: () => secretVault.getSecret(COMPOSIO_API_KEY_NAME),
  getGuard: () => getGuard()
})
registerConnectorProvider(composioProvider)

const githubProvider = new GitHubCliProvider({
  getRepos: () => settingsService.getConfig().githubRepos ?? []
})
registerConnectorProvider(githubProvider)

function providerFor(toolId: string): { status: (t: ToolId) => Promise<{ connected: boolean; detail?: string }>; connect: (t: ToolId) => Promise<{ ok: boolean; url?: string; error?: string }> } | null {
  if (toolId === 'gmail') return composioProvider
  if (toolId === 'github') return githubProvider
  return null
}

let budgetGuard: BudgetGuard | null = null
/** Singleton guard; recreated (with counts carried over) when reset day changes. */
function getGuard(): BudgetGuard {
  const resetDay = settingsService.getConfig().resetDay ?? 1
  if (!budgetGuard || budgetGuard.resetDay !== resetDay) {
    const prev = budgetGuard?.status()
    budgetGuard = new BudgetGuard({ store: new ElectronBudgetStore(), resetDay })
    if (prev && prev.used > 0) {
      const st = budgetGuard.status()
      new ElectronBudgetStore().save({
        periodKey: st.periodKey,
        used: prev.used,
        scheduledUsed: prev.scheduledUsed
      })
    }
  }
  return budgetGuard
}

interface ActiveRun {
  controller: AbortController
  pending: Map<string, (d: ApprovalDecision) => void>
}
const activeRuns = new Map<string, ActiveRun>()

function emitToPalette(e: AgentEvent): void {
  getPaletteWindow()?.webContents.send(IpcChannels.agentEvent, e)
}

let tray: Tray | null = null
let hotkeyError: string | null = null

function wantsToggle(argv: string[]): boolean {
  return argv.includes('--toggle') || argv.includes('palette --toggle')
}

// Second-instance (palette --toggle CLI) routes through the single-instance lock.
app.on('second-instance', (_event, argv) => {
  if (wantsToggle(argv)) togglePalette()
  else showPalette()
})

function sessionType(): string {
  return process.env['XDG_SESSION_TYPE'] ?? (process.platform === 'linux' ? 'unknown' : 'n/a')
}

function platformInfo(): PlatformInfo {
  const st = sessionType()
  const wayland = process.platform === 'linux' && st === 'wayland'
  return {
    platform: process.platform,
    sessionType: st,
    wayland,
    // globalShortcut is unreliable on Wayland (Electron docs / portal path).
    globalShortcutReliable: !wayland
  }
}

function waylandToggleHint(): string {
  const execPath = process.execPath
  return (
    `Global hotkeys don't work reliably on Wayland, so the hotkey was not registered.\n\n` +
    `Fallback: bind a system shortcut in your desktop settings (GNOME: Settings → Keyboard → Custom Shortcut, ` +
    `KDE: System Settings → Shortcuts) to run:\n${execPath} --toggle`
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
  // ponytail: 1px placeholder icon, real tray artwork lands in M6.
  const icon =
    nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAA4AAAAOCAYAAAAfSC3RAAAAFElEQVR42mP8z8AARQMTEwMTAwMAJBYAAWzRRf4AAAAASUVORK5CYII='
    ) || nativeImage.createEmpty()
  tray = new Tray(icon)
  tray.setToolTip('CalTen')
  const menu = Menu.buildFromTemplate([
    { label: 'Toggle palette', click: () => togglePalette() },
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

  ipcMain.handle(IpcChannels.paletteResize, (_event, payload: unknown) => {
    const parsed = PaletteResizeSchema.safeParse(payload)
    if (!parsed.success) return { ok: false as const, error: 'Invalid resize payload.' }
    const height = resizePaletteToContent(parsed.data.height)
    return { ok: true as const, height }
  })

  ipcMain.handle(IpcChannels.getModelSettings, async () => settingsService.getPublicState())

  ipcMain.handle(IpcChannels.setModelSettings, async (_event, payload: unknown) => {
    const parsed = ModelSettingsSchema.safeParse(payload)
    if (!parsed.success) return { ok: false as const, error: 'Invalid model settings.' }
    try {
      // GitHub repos: validate path + git repo + origin match before storing.
      // Only allowlisted repos are ever accessible to @github tools.
      for (const entry of parsed.data.githubRepos ?? []) {
        const checked = await validateRepoEntry(entry)
        if (!checked.ok) {
          return { ok: false as const, error: `GitHub repo "${entry.repo || entry.path}": ${checked.error}` }
        }
      }
      const saved = settingsService.setConfig(parsed.data)
      return { ok: true as const, settings: { ...saved, keySet: undefined, encryptionAvailable: undefined } }
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(IpcChannels.setApiKey, async (_event, payload: unknown) => {
    const parsed = ApiKeySchema.safeParse(payload)
    if (!parsed.success) return { ok: false as const, error: 'Invalid API key.' }
    try {
      await settingsService.setApiKey(parsed.data.key)
      return { ok: true as const }
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(IpcChannels.clearApiKey, async () => {
    await settingsService.clearApiKey()
    return { ok: true as const }
  })

  ipcMain.handle(IpcChannels.setComposioKey, async (_event, payload: unknown) => {
    const parsed = ApiKeySchema.safeParse(payload)
    if (!parsed.success) return { ok: false as const, error: 'Invalid Composio API key.' }
    try {
      await secretVault.setSecret(COMPOSIO_API_KEY_NAME, parsed.data.key)
      return { ok: true as const }
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(IpcChannels.clearComposioKey, async () => {
    await secretVault.clearSecret(COMPOSIO_API_KEY_NAME)
    return { ok: true as const }
  })

  ipcMain.handle(IpcChannels.connectionStatus, async (_event, payload: unknown) => {
    const parsed = ConnectionToolSchema.safeParse(payload)
    if (!parsed.success) return { ok: false as const, error: 'Invalid connection request.' }
    const provider = providerFor(parsed.data.toolId)
    if (!provider) return { ok: false as const, error: 'Unknown tool.' }
    try {
      const st = await provider.status(parsed.data.toolId as ToolId)
      return { ok: true as const, ...st }
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(IpcChannels.connectionConnect, async (_event, payload: unknown) => {
    const parsed = ConnectionToolSchema.safeParse(payload)
    if (!parsed.success) return { ok: false as const, error: 'Invalid connection request.' }
    const provider = providerFor(parsed.data.toolId)
    if (!provider) return { ok: false as const, error: 'Unknown tool.' }
    try {
      const res = await provider.connect(parsed.data.toolId as ToolId)
      if (res.ok && res.url) {
        // Auth happens in the user's own browser; the Composio key and any
        // tokens stay in main. Renderer polls connectionStatus until ACTIVE.
        await shell.openExternal(res.url)
      }
      return { ok: res.ok as boolean, url: res.url, error: res.error }
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(IpcChannels.getBudget, () => {
    const st = getGuard().status()
    return {
      used: st.used,
      budget: st.budget,
      remaining: st.remaining,
      warning: st.warning,
      scheduledUsed: st.scheduledUsed,
      scheduledBudget: st.scheduledBudget,
      periodKey: st.periodKey
    }
  })

  function startAgentRun(prompt: string, toolNames: string[], source: 'palette' | 'scheduled'): string {
    const runId = randomUUID()
    const controller = new AbortController()
    const active: ActiveRun = { controller, pending: new Map() }
    activeRuns.set(runId, active)
    const tools = toolNames.filter((t): t is ToolId => (TOOL_IDS as readonly string[]).includes(t))
    void runAgent({
      prompt,
      tools,
      source,
      signal: controller.signal,
      runId,
      emit: emitToPalette,
      decideApproval: (req) =>
        new Promise<ApprovalDecision>((resolve) => {
          active.pending.set(req.approvalId, resolve)
          // Re-emit is unnecessary (runner already emitted); just track.
          // If the run is cancelled first, cancel resolves this as denied.
        }),
      deps: {
        getConfig: () => settingsService.getConfig(),
        getApiKey: () => settingsService.getApiKey()
      }
    })
      .catch((err) => {
        emitToPalette({
          type: 'error',
          runId,
          message: err instanceof Error ? err.message : String(err)
        })
      })
      .finally(() => {
        activeRuns.delete(runId)
        getGuard().endRun(runId)
      })
    return runId
  }

  ipcMain.handle(IpcChannels.agentRun, (_event, payload: unknown) => {
    const parsed = AgentRunRequestSchema.safeParse(payload)
    if (!parsed.success) return { ok: false as const, error: 'Invalid agent request.' }
    const runId = startAgentRun(parsed.data.prompt, parsed.data.tools, parsed.data.source)
    return { ok: true as const, runId }
  })

  ipcMain.handle(IpcChannels.agentCancel, (_event, payload: unknown) => {
    const parsed = AgentCancelSchema.safeParse(payload)
    if (!parsed.success) return { ok: false as const, error: 'Invalid cancel request.' }
    const active = activeRuns.get(parsed.data.runId)
    if (!active) return { ok: false as const, error: 'Run not found (it may have finished).' }
    for (const resolve of active.pending.values()) {
      resolve({ approved: false, reason: 'Run cancelled.' })
    }
    active.pending.clear()
    active.controller.abort()
    return { ok: true as const }
  })

  ipcMain.handle(IpcChannels.agentApproval, (_event, payload: unknown) => {
    const parsed = AgentApprovalResponseSchema.safeParse(payload)
    if (!parsed.success) return { ok: false as const, error: 'Invalid approval response.' }
    const active = activeRuns.get(parsed.data.runId)
    if (!active) return { ok: false as const, error: 'Run not found (it may have finished).' }
    const resolve = active.pending.get(parsed.data.approvalId)
    if (!resolve) return { ok: false as const, error: 'Approval request not found.' }
    active.pending.delete(parsed.data.approvalId)
    resolve({ approved: parsed.data.approved, reason: parsed.data.reason })
    return { ok: true as const }
  })

  ipcMain.on(IpcChannels.calendarMinimize, () => getCalendarWindow()?.minimize())
  ipcMain.on(IpcChannels.calendarMaximize, () => {
    const w = getCalendarWindow()
    if (!w) return
    if (w.isMaximized()) w.unmaximize()
    else w.maximize()
  })
  ipcMain.on(IpcChannels.calendarClose, () => getCalendarWindow()?.close())

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

    // Everything else runs the agent loop (Prompt 0 foundation: ToolLoopAgent
    // + built-in echo tools). The renderer streams events via agent:event.
    const runId = startAgentRun(parsed.data.text, submit.tools, 'palette')
    return { ok: true as const, action: 'agent', tools: submit.tools, runId }
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
  app.setName('CalTen')

  // CLI flag through the single-instance lock.
  if (wantsToggle(process.argv)) {
    // First instance started with --toggle: start hidden (tray only).
    // (No window to toggle yet; just don't show anything.)
  }

  applyStrictCsp()
  createPaletteWindow()
  wireIpc()
  createTray()
  applyAutostart()

  const hotkey = store.get('hotkey', defaultHotkey(process.platform))
  const registered = registerHotkey(hotkey)
  if (!registered && platformInfo().wayland) {
    new Notification({
      title: 'Palette: hotkey unavailable on Wayland',
      body: 'Bind a system shortcut to palette --toggle. See Settings for the exact command.'
    }).show()
  }

  // macOS: hide the Dock icon while only the palette is open (keep it in dev so the app is findable).
  // ponytail: calendar is the main window now — dock stays visible whenever it is open.
  if (process.platform === 'darwin' && app.dock && !process.env['ELECTRON_RENDERER_URL'] && !getCalendarWindow())
    app.dock.hide()

  // Calendar-first: CalTen opens on every launch (unless --toggle tray-only).
  if (!wantsToggle(process.argv)) {
    openCalendar()
  }

  app.on('activate', () => {
    // ponytail: Dock click must show something — recreate only if gone, then show.
    if (BrowserWindow.getAllWindows().length === 0) createPaletteWindow()
    // ponytail: calendar-first; palette only via hotkey/tray.
    openCalendar()
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
