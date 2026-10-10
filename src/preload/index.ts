import { contextBridge, ipcRenderer } from 'electron'
import { automationsApi } from './automations.js'
import { shellApi } from './shell.js'

/**
 * Preload: contextBridge API only. No API keys or tokens ever reach the renderer.
 * Every invoke payload is validated with zod in the main process.
 */

const api = {
  onOpenSettings: (cb: (tab?: string) => void) => {
    const fn = (_event: unknown, tab?: string): void => cb(tab)
    ipcRenderer.on('settings:open', fn)
    return () => ipcRenderer.removeListener('settings:open', fn)
  },
  getModelSettings: (): Promise<{
    provider: string
    model: string
    baseUrl?: string
    resetDay?: number
    githubRepos?: Array<{ path: string; repo: string; testCommand?: string }>
    autoApprove?: string[]
    keySet: boolean
    encryptionAvailable: boolean
  }> => ipcRenderer.invoke('settings:get-model'),
  setModelSettings: (s: {
    provider: string
    model: string
    baseUrl?: string
    resetDay?: number
    githubRepos?: Array<{ path: string; repo: string; testCommand?: string }>
    autoApprove?: string[]
  }) =>
    ipcRenderer.invoke('settings:set-model', s),
  setApiKey: (key: string) => ipcRenderer.invoke('settings:set-api-key', { key }),
  clearApiKey: () => ipcRenderer.invoke('settings:clear-api-key'),
  connectionStatus: (toolId: string): Promise<{ ok: boolean; connected?: boolean; detail?: string; error?: string }> =>
    ipcRenderer.invoke('connections:status', { toolId }),
  connectionConnect: (toolId: string): Promise<{ ok: boolean; url?: string; error?: string }> =>
    ipcRenderer.invoke('connections:connect', { toolId }),
  agentRun: (payload: { prompt: string; tools: string[]; source: 'palette' | 'chat' | 'scheduled' }) =>
    ipcRenderer.invoke('agent:run', payload),
  agentCancel: (runId: string) => ipcRenderer.invoke('agent:cancel', { runId }),
  agentApproval: (payload: { runId: string; approvalId: string; approved: boolean; reason?: string }) =>
    ipcRenderer.invoke('agent:approval', payload),
  onAgentEvent: (cb: (e: unknown) => void) => {
    const fn = (_e: unknown, event: unknown): void => cb(event)
    ipcRenderer.on('agent:event', fn)
    return () => ipcRenderer.removeListener('agent:event', fn)
  },
  getBudget: (): Promise<{
    used: number
    budget: number
    remaining: number
    warning: string
    scheduledUsed: number
    scheduledBudget: number
    periodKey: string
  }> => ipcRenderer.invoke('budget:get'),
  getConnector: (): Promise<{
    configured: boolean
    encryptionAvailable: boolean
    services: Array<{ id: string; connected: boolean; detail?: string }>
  }> => ipcRenderer.invoke('connector:get'),
  setConnectorKey: (key: string) => ipcRenderer.invoke('connector:set-key', { key }),
  clearConnectorKey: () => ipcRenderer.invoke('connector:clear-key'),
  githubStatus: (): Promise<{
    ok: boolean
    installed?: boolean
    authenticated?: boolean
    detail?: string
    repos?: Array<{ path: string; repo: string }>
    error?: string
  }> => ipcRenderer.invoke('github:status'),
  routineList: (): Promise<{
    ok: boolean
    routines: Array<{
      id: string
      prompt: string
      tools: string[]
      runAt: number
      repeat: string
      enabled: boolean
      lastStatus?: string
    }>
  }> => ipcRenderer.invoke('routine:list'),
  routineCreate: (text: string) => ipcRenderer.invoke('routine:create', { text }),
  routineRemove: (id: string) => ipcRenderer.invoke('routine:remove', { id }),
  routineToggle: (id: string, enabled: boolean) => ipcRenderer.invoke('routine:toggle', { id, enabled }),
  getProfile: (): Promise<{ name: string; email: string; about: string; language: string }> =>
    ipcRenderer.invoke('settings:get-profile'),
  setProfile: (p: { name: string; email: string; about: string; language: string }) =>
    ipcRenderer.invoke('settings:set-profile', p),
  getAppBehavior: (): Promise<{ ok: boolean; keepBackground: boolean; shader: boolean }> =>
    ipcRenderer.invoke('app:get-behavior'),
  setAppBehavior: (p: {
    keepBackground?: boolean
    shader?: boolean
  }): Promise<{ ok: boolean; keepBackground?: boolean; shader?: boolean; error?: string }> =>
    ipcRenderer.invoke('app:set-behavior', p),
  openSettingsWindow: (tab?: string) => ipcRenderer.send('settings:show', tab ? { tab } : undefined),
  closeSettings: () => ipcRenderer.send('settings:hide'),
  onSettingsClose: (cb: () => void) => {
    const fn = (): void => cb()
    ipcRenderer.on('settings:close', fn)
    return () => ipcRenderer.removeListener('settings:close', fn)
  },
  ...shellApi,
  ...automationsApi
}

export type AppApi = typeof api

contextBridge.exposeInMainWorld('app', api)
