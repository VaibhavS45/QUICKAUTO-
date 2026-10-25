import { contextBridge, ipcRenderer } from 'electron'
import { shellApi } from './shell.js'
import { automationsApi } from './automations.js'
import { authApi } from './auth.js'
import type { ChatMessage, ChatThread } from '../shared/chat.js'
import { AgentEventSchema, type AgentEvent } from '../shared/agent.js'
import type { ComposioToolkit } from '../main/connectors/composio-marketplace.js'

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
  agentRun: (payload: {
    prompt: string
    tools: string[]
    source: 'palette' | 'chat' | 'scheduled'
    chatId?: string
    history?: ChatMessage[]
    systemPrompt?: string
  }): Promise<{ ok: boolean; runId?: string; error?: string }> =>
    ipcRenderer.invoke('agent:run', payload),
  agentCancel: (runId: string) => ipcRenderer.invoke('agent:cancel', { runId }),
  agentApproval: (payload: { runId: string; approvalId: string; approved: boolean; reason?: string }) =>
    ipcRenderer.invoke('agent:approval', payload),
  onAgentEvent: (cb: (e: AgentEvent) => void) => {
    const fn = (_e: unknown, event: unknown): void => {
      const parsed = AgentEventSchema.safeParse(event)
      if (!parsed.success) {
        console.error('Rejected invalid agent event payload.')
        return
      }
      cb(parsed.data)
    }
    ipcRenderer.on('agent:event', fn)
    return () => {
      ipcRenderer.removeListener('agent:event', fn)
    }
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
  composioToolkits: (query = ''): Promise<{ ok: boolean; toolkits?: ComposioToolkit[]; error?: string }> =>
    ipcRenderer.invoke('composio:toolkits', { query }).catch((error: unknown) => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    })),
  composioConnect: (toolkit: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('composio:connect', { toolkit }).catch((error: unknown) => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    })),
  githubStatus: (): Promise<{
    ok: boolean
    installed?: boolean
    authenticated?: boolean
    detail?: string
    repos?: Array<{ path: string; repo: string }>
    error?: string
  }> => ipcRenderer.invoke('github:status'),
  getAgentProvider: (): Promise<{ ok: boolean; provider?: string; error?: string }> =>
    ipcRenderer.invoke('agent-provider:get'),
  setAgentProvider: (provider: string): Promise<{ ok: boolean; provider?: string; error?: string }> =>
    ipcRenderer.invoke('agent-provider:set', { provider }),
  detectHarnesses: (): Promise<{
    ok: boolean
    harnesses?: Array<{ id: string; installed: boolean; version?: string; detail: string }>
    error?: string
  }> => ipcRenderer.invoke('agent-provider:detect'),
  opencodeModels: (): Promise<{
    ok: boolean
    current?: string
    options?: Array<{ value: string; name: string }>
    error?: string
  }> => ipcRenderer.invoke('opencode:models'),
  opencodeModelGet: (): Promise<{ ok: boolean; model?: string | null }> =>
    ipcRenderer.invoke('opencode:model-get'),
  opencodeModelSet: (model: string): Promise<{ ok: boolean; model?: string; error?: string }> =>
    ipcRenderer.invoke('opencode:model-set', { model }),
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
  routineUpdate: (id: string, patch: { prompt?: string; repeat?: string; runAt?: number; tools?: string[]; enabled?: boolean }) =>
    ipcRenderer.invoke('routine:update', { id, ...patch }),
  getProfile: (): Promise<{ name: string; email: string; about: string; language: string }> =>
    ipcRenderer.invoke('settings:get-profile'),
  setProfile: (p: { name: string; email: string; about: string; language: string }) =>
    ipcRenderer.invoke('settings:set-profile', p),
  getAppBehavior: (): Promise<{ ok: boolean; keepBackground: boolean; shader: boolean; theme: string }> =>
    ipcRenderer.invoke('app:get-behavior'),
  setAppBehavior: (p: {
    keepBackground?: boolean
    shader?: boolean
    theme?: string
  }): Promise<{ ok: boolean; keepBackground?: boolean; shader?: boolean; theme?: string; error?: string }> =>
    ipcRenderer.invoke('app:set-behavior', p),
  chatList: (): Promise<{ ok: boolean; threads: ChatThread[] }> =>
    ipcRenderer.invoke('shell:chat-list'),
  chatGet: (id: string): Promise<{ ok: boolean; thread?: ChatThread; error?: string }> =>
    ipcRenderer.invoke('shell:chat-get', { id }),
  chatCreate: (): Promise<{ ok: boolean; thread?: ChatThread; error?: string }> =>
    ipcRenderer.invoke('shell:chat-create', {}),
  chatAppend: (id: string, message: ChatMessage): Promise<{ ok: boolean; thread?: ChatThread; error?: string }> =>
    ipcRenderer.invoke('shell:chat-append', { id, message }),
  chatRename: (id: string, title: string): Promise<{ ok: boolean; thread?: ChatThread; error?: string }> =>
    ipcRenderer.invoke('shell:chat-rename', { id, title }),
  chatRemove: (id: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('shell:chat-remove', { id }),
  chatClear: (): Promise<{ ok: boolean; removed?: number; error?: string }> =>
    ipcRenderer.invoke('shell:chat-clear', {}),
  openFileDialog: (options: { multiple?: boolean }): Promise<{ ok: boolean; canceled?: boolean; filePaths?: string[]; error?: string }> =>
    ipcRenderer.invoke('dialog:open-file', options),
  driveStatus: (): Promise<{ ok: boolean; connected?: boolean; detail?: string; error?: string }> =>
    ipcRenderer.invoke('drive:status').catch((error: unknown) => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    })),
  driveListFiles: (query = ''): Promise<{
    ok: boolean
    files?: Array<{ id: string; name: string; mimeType: string; size?: string; modifiedTime?: string; webViewLink?: string }>
    notConnected?: boolean
    error?: string
  }> =>
    ipcRenderer.invoke('drive:list', { query }).catch((error: unknown) => ({
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    })),
  openSettingsWindow: (tab?: string) => ipcRenderer.send('settings:show', tab ? { tab } : undefined),
  closeSettings: () => ipcRenderer.send('settings:hide'),
  onSettingsClose: (cb: () => void) => {
    const fn = (): void => cb()
    ipcRenderer.on('settings:close', fn)
    return () => ipcRenderer.removeListener('settings:close', fn)
  },
  ...shellApi,
  ...automationsApi,
  ...authApi
}

export type AppApi = typeof api

contextBridge.exposeInMainWorld('app', api)
