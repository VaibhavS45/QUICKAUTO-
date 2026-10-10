import { app, ipcMain, session, Notification, safeStorage, shell } from 'electron'
import Store from 'electron-store'
import { randomUUID } from 'node:crypto'
import { openSettings, hideSettings } from './agent/settings-window.js'
import {
  IpcChannels,
  ApiKeySchema,
  ConnectorKeySchema,
  RoutineCreateSchema,
  RoutineIdSchema,
  RoutineToggleSchema,
  AgentCancelSchema,
  AgentRunRequestSchema,
  AgentApprovalResponseSchema,
  ModelSettingsSchema,
  ProfileSettingsSchema,
  SettingsTabRequestSchema,
  ConnectionToolSchema
} from './ipc.js'
import { TOOL_IDS, type ToolId } from '../shared/types.js'
import type { AgentEvent } from '../shared/agent.js'
import { runAgent, type ApprovalDecision } from './agent/runner.js'
import { ModelSettingsService, type SettingsStore } from './settings/model-settings.js'
import { ProfileSettingsService } from './agent/profile-settings.js'
import { GitHubResolveProvider } from './connectors/github-resolve.js'
import { OpencodeServerManager } from './agent/opencode-server.js'
import { runOpencodeResolve, type OpencodePermission } from './agent/opencode-resolve.js'
import {
  setNestedApprovalHandler,
  nextNestedApprovalId,
  requestNestedApprovalForCurrentRun
} from './agent/nested-approval.js'
import { BudgetGuard, type BudgetStore, type BudgetUsageState } from './connectors/budget-guard.js'
import { ConnectorSettingsService, type ConnectorStore } from './connectors/connector-settings.js'
import { ComposioProvider } from './connectors/composio-tools.js'
import { GitHubCliProvider, isZeroCostTool, validateRepoEntry } from './connectors/github-cli.js'
import { ComposioConnectorProvider, isBudgetGuardedTool } from './connectors/composio.js'
import { registerConnectorProvider, getToolsForMentions } from './agent/registry.js'
import {
  Scheduler,
  type Routine,
  type RoutineStore
} from './agent/scheduler.js'
import { shouldAutoOpenApp } from './shell/launch-policy.js'
import { applyAppBehaviorPatch, resolveAppBehavior, type AppBehavior } from './agent/app-prefs.js'
import { installStdioGuard } from './agent/stdio-guard.js'
import { createAppTray, watchDockVisibility } from './shell/app-lifecycle.js'
import { registerAutomationsIpc, registerShellIpc } from './agent/shell-ipc.js'
import { getShellAppWindow, openShellAppWindow } from './agent/shell-app-window.js'
import type { RunSource } from '../shared/agent.js'
import { ChatStore, type ChatStoreStorage } from './shell/chat-store.js'
import { registerChatIpc } from './shell/chat-ipc.js'
import { createShellRuntime } from './shell/runtime.js'
import { createSettingsShellRuntime } from './shell/settings-runtime.js'

// Launched without a console, stdio writes hit EPIPE and kill main — swallow it first.
installStdioGuard()

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) app.quit()

const store = new Store<{ openAtLogin: boolean; keepBackground: boolean; shader: boolean; hotkey?: string }>({
  defaults: { openAtLogin: false, keepBackground: true, shader: true }
})
store.delete('hotkey')

function storedAppBehavior(): AppBehavior {
  return resolveAppBehavior({
    keepBackground: store.get('keepBackground', true),
    shader: store.get('shader', true)
  })
}

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

const settingsService = new ModelSettingsService(new ElectronSettingsStore(), {
  isAsyncEncryptionAvailable: () => safeStorage.isAsyncEncryptionAvailable(),
  encryptStringAsync: (s: string) => safeStorage.encryptStringAsync(s),
  decryptStringAsync: (b: Buffer) => safeStorage.decryptStringAsync(b)
})

const profileService = new ProfileSettingsService(new ElectronSettingsStore())

const chatFile = new Store<{ 'chat-threads': unknown[] }>({
  name: 'palette-chats',
  defaults: { 'chat-threads': [] }
})

class ElectronChatStore implements ChatStoreStorage {
  get(key: string): unknown {
    return (chatFile as unknown as { get: (k: string) => unknown }).get(key)
  }
  set(key: string, value: unknown): void {
    ;(chatFile as unknown as { set: (k: string, v: unknown) => void }).set(key, value)
  }
}

const chatStore = new ChatStore(new ElectronChatStore())
const settingsShellRuntime = createSettingsShellRuntime(safeStorage)

const connectorFile = new Store<Record<string, unknown>>({ name: 'palette-connectors', defaults: {} })

class ElectronConnectorStore implements ConnectorStore {
  get(key: string): unknown {
    return (connectorFile as unknown as { get: (k: string) => unknown }).get(key)
  }
  set(key: string, value: unknown): void {
    ;(connectorFile as unknown as { set: (k: string, v: unknown) => void }).set(key, value)
  }
}

const connectorSettings = new ConnectorSettingsService(new ElectronConnectorStore(), {
  isAsyncEncryptionAvailable: () => safeStorage.isAsyncEncryptionAvailable(),
  encryptStringAsync: (s: string) => safeStorage.encryptStringAsync(s),
  decryptStringAsync: (b: Buffer) => safeStorage.decryptStringAsync(b)
})

registerConnectorProvider(new ComposioProvider(() => connectorSettings.getKey()))

// Read-only @github via the local `gh` CLI + git (zero Composio cost).
// Reads repos from model settings (validated allowlist); the gh token is
// never read or stored — auth happens via `gh auth login` in the terminal.
const githubProvider = new GitHubCliProvider({
  getRepos: () => settingsService.getConfig().githubRepos ?? []
})
registerConnectorProvider(githubProvider)

const opencodeManager = new OpencodeServerManager()
const githubResolveProvider = new GitHubResolveProvider({
  getRepos: () => settingsService.getConfig().githubRepos ?? [],
  getOpencode: () => opencodeManager,
  opencodeResolve: (opts) =>
    runOpencodeResolve({
      ...opts,
      onPermission: async (perm: OpencodePermission) =>
        (
          await requestNestedApprovalForCurrentRun({
            toolName: `opencode: ${perm.type} ${perm.title}`,
            input: { pattern: perm.pattern ?? null, metadata: perm.metadata ?? null },
            reason: 'OpenCode requests permission while resolving conflicts.'
          })
        ).approved
    })
})
registerConnectorProvider(githubResolveProvider)

// Real read-only @gmail provider (feat/gmail-read). Registered after the stub
// so its gmail_* tools are the ones served; distinct provider id avoids the
// registry's duplicate-id ignore. Its tools guard themselves (with cache and
// dedupe keys), so the generic wrapper below skips them —
// exactly one BudgetGuard hit per Composio call.
const gmailProvider = new ComposioConnectorProvider({
  getApiKey: () => connectorSettings.getKey(),
  getGuard: () => getGuard()
})
registerConnectorProvider(gmailProvider)
registerConnectorProvider(settingsShellRuntime.mcpProvider)

const routineFile = new Store<{ routines: Routine[] }>({ name: 'palette-routines', defaults: { routines: [] } })
let routineChangeHook = (): void => {}

class ElectronRoutineStore implements RoutineStore {
  load(): Routine[] {
    return routineFile.get('routines', [])
  }
  save(routines: Routine[]): void {
    routineFile.set('routines', routines)
    routineChangeHook()
  }
}

const scheduledActive = new Set<string>()
/** Assigned inside wireIpc (needs startAgentRun + Notification scope). */
let fireRoutine: (r: Routine) => void = () => {}

const scheduler = new Scheduler(new ElectronRoutineStore(), {
  isRunning: (id) => scheduledActive.has(id),
  fire: (routine) => fireRoutine(routine)
})

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

function emitToApp(e: AgentEvent): void {
  getShellAppWindow()?.webContents.send(IpcChannels.agentEvent, e)
}

setNestedApprovalHandler(
  (req) =>
    new Promise((resolve) => {
      const active = activeRuns.get(req.runId)
      if (!active) {
        resolve({ approved: false, reason: 'Run ended.' })
        return
      }
      const approvalId = nextNestedApprovalId()
      active.pending.set(approvalId, resolve)
      emitToApp({
        type: 'approval-requested',
        runId: req.runId,
        approvalId,
        toolCallId: approvalId,
        toolName: req.toolName,
        input: req.input,
        reason: req.reason
      })
    })
)

app.on('second-instance', () => openShellAppWindow())

function applyAutostart(): void {
  const openAtLogin = store.get('openAtLogin', false)
  app.setLoginItemSettings({ openAtLogin })
}

function createTray(): void {
  createAppTray(
    () => openSettings(),
    () => store.get('openAtLogin', false),
    (enabled) => {
      store.set('openAtLogin', enabled)
      applyAutostart()
    }
  )
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
  const shellRuntime = createShellRuntime(ipcMain, () => scheduler.list(), getShellAppWindow, (id, status) => scheduler.markRan(id, status))
  routineChangeHook = () => shellRuntime.scheduleChanged()
  registerShellIpc()
  registerAutomationsIpc()
  registerChatIpc(ipcMain, chatStore)
  settingsShellRuntime.registerIpc(ipcMain)
  fireRoutine = (routine) => {
    startAgentRun(routine.prompt, routine.tools, 'scheduled', routine.id)
    shellRuntime.notify({ kind: 'info', title: 'Automation started', body: routine.prompt.slice(0, 200) })
    shellRuntime.notificationsChanged()
    new Notification({ title: 'Palette routine fired', body: routine.prompt.slice(0, 200) }).show()
  }
  ipcMain.handle(IpcChannels.getModelSettings, async () => settingsService.getPublicState())

  ipcMain.handle(IpcChannels.getProfile, () => profileService.get())

  ipcMain.handle(IpcChannels.getAppBehavior, () => ({ ok: true as const, ...storedAppBehavior() }))

  ipcMain.handle(IpcChannels.setAppBehavior, (_event, payload: unknown) => {
    const next = applyAppBehaviorPatch(storedAppBehavior(), payload)
    if (!next) return { ok: false as const, error: 'Invalid app behavior.' }
    store.set('keepBackground', next.keepBackground)
    store.set('shader', next.shader)
    return { ok: true as const, ...next }
  })

  ipcMain.on(IpcChannels.settingsShow, (_event, payload: unknown) => {
    const parsed = SettingsTabRequestSchema.safeParse(payload)
    if (!parsed.success) {
      console.warn('Rejected invalid Settings tab request.')
      return
    }
    openSettings(parsed.data?.tab)
  })
  ipcMain.on(IpcChannels.settingsHide, () => hideSettings())

  ipcMain.handle(IpcChannels.setProfile, (_event, payload: unknown) => {
    const parsed = ProfileSettingsSchema.safeParse(payload)
    if (!parsed.success) return { ok: false as const, error: 'Invalid profile settings.' }
    try {
      const profile = profileService.set(parsed.data)
      return { ok: true as const, profile }
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
    }
  })

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

  function startAgentRun(
    prompt: string,
    toolNames: string[],
    source: RunSource,
    routineId?: string,
    history?: import('../shared/chat.js').ChatMessage[],
    systemPrompt?: string,
    chatId?: string
  ): string {
    const runId = randomUUID()
    const startedAt = Date.now()
    const controller = new AbortController()
    const active: ActiveRun = { controller, pending: new Map() }
    activeRuns.set(runId, active)
    if (routineId) scheduledActive.add(routineId)
    shellRuntime.startRun({
      id: runId,
      ...(routineId ? { routineId } : {}),
      ...(chatId ? { chatId } : {}),
      title: prompt.slice(0, 200),
      startedAt,
    })
    const tools = toolNames.filter((t): t is ToolId => (TOOL_IDS as readonly string[]).includes(t))
    const guard = getGuard()
    void runAgent({
      prompt,
      tools,
      source,
      history,
      systemPrompt,
      signal: controller.signal,
      runId,
      emit: (event) => {
        shellRuntime.observeRunEvent(event)
        emitToApp(event)
      },
      decideApproval: (req) =>
        new Promise<ApprovalDecision>((resolve) => {
          active.pending.set(req.approvalId, resolve)
          // Re-emit is unnecessary (runner already emitted); just track.
          // If the run is cancelled first, cancel resolves this as denied.
        }),
      deps: {
        getConfig: () => settingsService.getConfig(),
        getApiKey: () => settingsService.getApiKey(),
        // Every Composio tool execution goes through BudgetGuard here.
        // Local gh tools are free; Gmail tools already guard themselves with
        // cache and dedupe keys, so neither should be metered here again.
        getTools: async (ids) => {
          const set = await getToolsForMentions(ids)
          for (const [name, t] of Object.entries(set)) {
            if (name === 'echo' || name === 'echo_write' || name.startsWith('mcp_')) continue
            if (name.startsWith('github_') || isZeroCostTool(t)) continue
            if (isBudgetGuardedTool(t)) continue
            const orig = (t as { execute?: unknown }).execute
            if (typeof orig !== 'function') continue
            const fn = orig as (args: never, opts: never) => Promise<unknown>
            ;(t as { execute: unknown }).execute = (args: never, opts: never) =>
              guard
                .execute({ source, runId, label: name, fn: () => fn(args, opts) })
                .then((r) => r.result)
          }
          return set
        }
      }
    })
    .catch((err) => {
      const message = err instanceof Error ? err.message : String(err)
      shellRuntime.observeRunFailure(runId, message)
      emitToApp({
        type: 'error',
        runId,
        message
      })
    })
    .finally(() => {
      activeRuns.delete(runId)
      getGuard().endRun(runId)
      shellRuntime.finishRun(runId)
      if (routineId) scheduledActive.delete(routineId)
    })
    return runId
  }

  ipcMain.handle(IpcChannels.agentRun, (_event, payload: unknown) => {
    const parsed = AgentRunRequestSchema.safeParse(payload)
    if (!parsed.success) return { ok: false as const, error: 'Invalid agent request.' }
    let history = parsed.data.history
    if (parsed.data.chatId) {
      if (!chatStore.get(parsed.data.chatId)) return { ok: false as const, error: 'Chat not found.' }
      history = chatStore.historyFor(parsed.data.chatId)
      const appended = chatStore.append(parsed.data.chatId, {
        role: 'user',
        text: parsed.data.prompt,
        createdAt: Date.now()
      })
      if (!appended) return { ok: false as const, error: 'Chat not found.' }
    }
    const runId = startAgentRun(
      parsed.data.prompt,
      parsed.data.tools,
      parsed.data.source,
      undefined,
      history,
      parsed.data.systemPrompt,
      parsed.data.chatId
    )
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

  ipcMain.handle(IpcChannels.getConnector, async () => {
    const pub = await connectorSettings.getPublicState()
    // Gmail status is provided by its dedicated connection IPC; GitHub uses
    // the local CLI. Composio status applies only to its other services.
    const ids = ['notion', 'sheets', 'websearch'] as const
    const services: Array<{ id: string; connected: boolean; detail?: string }> = await Promise.all(
      ids.map(async (id) => {
        const s = await new ComposioProvider(() => connectorSettings.getKey()).status(id)
        return { id, ...s }
      })
    )
    const gh = await githubProvider.checkGh()
    services.push({
      id: 'github',
      connected: gh.installed && gh.authenticated,
      detail: gh.detail
    })
    return { ...pub, services }
  })

  ipcMain.handle(IpcChannels.setConnectorKey, async (_event, payload: unknown) => {
    const parsed = ConnectorKeySchema.safeParse(payload)
    if (!parsed.success) return { ok: false as const, error: 'Invalid key.' }
    try {
      await connectorSettings.setKey(parsed.data.key)
      return { ok: true as const }
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(IpcChannels.clearConnectorKey, async () => {
    await connectorSettings.clearKey()
    return { ok: true as const }
  })

  // @github status (local gh CLI; no payload, nothing secret crosses IPC).
  // Reports gh presence + auth with the exact `gh auth login` fix, plus the
  // configured repo allowlist.
  ipcMain.handle(IpcChannels.githubStatus, async () => {
    try {
      const check = await githubProvider.checkGh()
      return {
        ok: true as const,
        installed: check.installed,
        authenticated: check.authenticated,
        detail: check.detail,
        repos: settingsService.getConfig().githubRepos ?? []
      }
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // Gmail connection status + connect (feat/gmail-read). The Composio API key
  // itself stays in connectorSettings (safeStorage); only status/URL crosses.
  ipcMain.handle(IpcChannels.connectionStatus, async (_event, payload: unknown) => {
    const parsed = ConnectionToolSchema.safeParse(payload)
    if (!parsed.success) return { ok: false as const, error: 'Invalid connection request.' }
    try {
      const st = await gmailProvider.status(parsed.data.toolId as ToolId)
      return { ok: true as const, ...st }
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(IpcChannels.connectionConnect, async (_event, payload: unknown) => {
    const parsed = ConnectionToolSchema.safeParse(payload)
    if (!parsed.success) return { ok: false as const, error: 'Invalid connection request.' }
    try {
      const res = await gmailProvider.connect(parsed.data.toolId as ToolId)
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

  ipcMain.handle(IpcChannels.routineList, () => ({ ok: true as const, routines: scheduler.list() }))

  ipcMain.handle(IpcChannels.routineCreate, (_event, payload: unknown) => {
    const parsed = RoutineCreateSchema.safeParse(payload)
    if (!parsed.success) return { ok: false as const, error: 'Invalid routine request.' }
    try {
      const routine = scheduler.create(parsed.data.text, new Date())
      return { ok: true as const, routine }
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle(IpcChannels.routineRemove, (_event, payload: unknown) => {
    const parsed = RoutineIdSchema.safeParse(payload)
    if (!parsed.success) return { ok: false as const, error: 'Invalid routine id.' }
    const removed = scheduler.remove(parsed.data.id)
    return removed
      ? { ok: true as const }
      : { ok: false as const, error: 'Routine not found.' }
  })

  ipcMain.handle(IpcChannels.routineToggle, (_event, payload: unknown) => {
    const parsed = RoutineToggleSchema.safeParse(payload)
    if (!parsed.success) return { ok: false as const, error: 'Invalid toggle request.' }
    const routine = scheduler.setEnabled(parsed.data.id, parsed.data.enabled)
    return routine
      ? { ok: true as const, routine }
      : { ok: false as const, error: 'Routine not found.' }
  })

}

async function onReady(): Promise<void> {
  app.setName('Palette')

  applyStrictCsp()
  watchDockVisibility()
  await settingsShellRuntime.loadPlugins(app.getPath('userData'))
  wireIpc()
  scheduler.startAll()
  createTray()
  applyAutostart()

  if (shouldAutoOpenApp(process.argv)) openShellAppWindow()
  app.on('activate', () => openShellAppWindow())
}

app.whenReady().then(() => void onReady())

// Tray keeps the app alive after windows close so schedules can fire —
// unless the user turned off "keep in background" in Settings.
app.on('window-all-closed', () => {
  if (!storedAppBehavior().keepBackground) app.quit()
  // Otherwise do not quit — tray keeps the app alive.
})

app.on('will-quit', () => {
  setNestedApprovalHandler(null)
  void opencodeManager.stop()
  void settingsShellRuntime.stopAll()
    .catch((error: unknown) => console.error('Could not stop MCP servers cleanly.', error))
})

export { store }
