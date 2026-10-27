/**
 * Browser preview shim (`npm run web`).
 *
 * In Electron the preload exposes `window.app`. A plain browser has no IPC, so
 * this installs a stub with in-memory mock data so the UI renders and can be
 * clicked through. It is dev-only mock data (never a production data source):
 * it activates only when no preload ran, so the Electron renderer is untouched.
 * Nothing here touches secrets or the network.
 */
import type { AppApi } from '../preload/index.js'

const noPreview = (): Promise<{ ok: false; error: string }> =>
  Promise.resolve({ ok: false, error: 'Not available in the browser preview.' })

/** Listener subscriptions must return an unsubscribe function, not a promise. */
const noopOff = (): (() => void) => () => {}

/**
 * Dev-only theme override for reliable screenshots: `?theme=light|dark|system`
 * on the preview URL wins over the stub's default night. Electron renderers
 * never run this shim, so it cannot affect production.
 */
const previewTheme = (): 'system' | 'light' | 'dark' => {
  const value = new URLSearchParams(window.location.search ?? '').get('theme')
  if (value === 'light' || value === 'dark' || value === 'system') return value
  return 'dark'
}

const openSettings = (tab?: string): void => {
  window.location.hash = tab ? `#settings?tab=${tab}` : '#settings'
}

const replies: Record<string, unknown> = {
  getAppBehavior: async () => ({ ok: true, keepBackground: false, shader: true, theme: previewTheme() }),
  setAppBehavior: async () => ({ ok: true }),
  getProfile: async () => ({ name: 'Browser Preview', email: 'preview@local', about: '', language: 'en' }),
  setProfile: async () => ({ ok: true }),
  chatList: async () => ({ ok: true, threads: [] }),
  chatGet: async () => ({ ok: false, error: 'Not available in the browser preview.' }),
  chatCreate: async () => ({ ok: false, error: 'Not available in the browser preview.' }),
  chatAppend: async () => ({ ok: false, error: 'Not available in the browser preview.' }),
  notificationsList: async () => ({ ok: true, notifications: [] }),
  notificationCreate: async () => ({ ok: true }),
  notificationRead: async () => ({ ok: true }),
  notificationsReadAll: async () => ({ ok: true, updated: 0 }),
  notificationDismiss: async () => ({ ok: true }),
  routineList: async () => ({ ok: true, routines: [] }),
  scheduleToday: async () => ({ ok: true, schedule: { date: '', entries: [] } }),
  authGetState: async () => ({ ok: true, state: { signedIn: true, configured: true, hasAccounts: true, method: 'local', name: 'Browser Preview', email: 'preview@local' } }),
  authSignIn: async () => ({ ok: true, state: { signedIn: true, configured: true, hasAccounts: true, method: 'local', name: 'Browser Preview', email: 'preview@local' } }),
  authLogin: async () => ({ ok: true, state: { signedIn: true, configured: true, hasAccounts: true, method: 'local', name: 'Browser Preview', email: 'preview@local' } }),
  authRegister: async () => ({ ok: true, state: { signedIn: true, configured: true, hasAccounts: true, method: 'local', name: 'Browser Preview', email: 'preview@local' } }),
  authSignOut: async () => ({ ok: true, state: { signedIn: false, configured: true, hasAccounts: true, method: 'local' } }),
  automationsList: async () => ({
    ok: true,
    automations: [
      {
        id: 'a1',
        kind: 'schedule',
        title: 'Morning inbox digest',
        prompt: 'Summarize the inbox',
        status: 'active',
        schedule: { type: 'daily', time: '09:00' },
        autoApprove: false,
        runMode: 'separate_task',
        agent: 'Manus 2.0',
        connectors: ['gmail'],
        createdAt: '2026-10-01T09:00:00.000Z'
      },
      {
        id: 'a2',
        kind: 'schedule',
        title: 'Weather in Bengaluru',
        prompt: 'What is the weather in Bengaluru?',
        status: 'paused',
        schedule: { type: 'weekly', time: '21:45', weekdays: [1] },
        autoApprove: false,
        runMode: 'separate_task',
        agent: 'Manus 2.0',
        connectors: ['composio', 'websearch'],
        createdAt: '2026-10-02T09:00:00.000Z'
      }
    ]
  }),
  recentTasks: async () => ({
    ok: true,
    runs: [
      {
        id: 'r1',
        routineId: 'a1',
        title: 'Morning inbox digest',
        startedAt: Date.now() - 3600_000,
        endedAt: Date.now() - 3500_000,
        status: 'succeeded',
        summary: 'Three newsletters and one receipt.'
      },
      {
        id: 'r2',
        routineId: 'a2',
        title: 'Weather in Bengaluru',
        startedAt: Date.now() - 86_400_000,
        endedAt: Date.now() - 86_390_000,
        status: 'failed',
        summary: 'The weather service did not answer.'
      }
    ]
  }),
  getBudget: async () => ({
    used: 0,
    budget: 15000,
    remaining: 15000,
    warning: '',
    scheduledUsed: 0,
    scheduledBudget: 0,
    periodKey: 'preview'
  }),
  getConnector: async () => ({ configured: false, encryptionAvailable: false, services: [] }),
  getModelSettings: async () => ({ provider: 'anthropic', model: 'claude-sonnet-4', keySet: false, encryptionAvailable: false }),
  agentsList: async () => ({ ok: true, agents: [] }),
  pluginsList: async () => ({ ok: true, plugins: [] }),
  mcpList: async () => ({ ok: true, servers: [] }),
  composioToolkits: async () => ({ ok: true, toolkits: [] }),
  githubStatus: async () => ({ ok: true, installed: false, authenticated: false, repos: [] }),
  opencodeModels: async () => ({ ok: true, options: [] }),
  detectHarnesses: async () => ({ ok: true, harnesses: [] }),
  getAgentProvider: async () => ({ ok: true, provider: 'opencode' }),
  driveStatus: async () => ({ ok: false, connected: false }),
  driveListFiles: async () => ({ ok: false, files: [] }),
  // Window controls map onto hash routing so the settings surface opens here too.
  openSettingsWindow: (tab?: string) => openSettings(tab),
  closeSettings: () => { window.location.hash = '#app' },
  // No-op: the renderer pushes the hash itself, which is the route that opens it.
  onOpenSettings: noopOff,
  onSettingsClose: noopOff,
  onUpdatesChanged: noopOff,
  onAgentEvent: noopOff,
  onNotificationsChanged: noopOff,
  onScheduleChanged: noopOff,
  onAuthChanged: noopOff
}

if (typeof window.app === 'undefined') {
  window.app = new Proxy({} as AppApi, {
    get: (_target, key: string) => (key in replies ? replies[key] : noPreview)
  }) as AppApi
  console.info('[preview] window.app stubbed — mock data, no Electron backend.')
}