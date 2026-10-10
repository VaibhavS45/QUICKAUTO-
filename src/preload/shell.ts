import { ipcRenderer } from 'electron'
import type { AppNotification } from '../shared/contracts/notifications.js'
import type { RunRecord, TodaySchedule } from '../shared/contracts/schedule.js'
import type { AgentProfile } from '../main/shell/agent-store.js'
import type { McpServerConfig, McpServerPublic } from '../main/shell/mcp-registry.js'
import type { Plugin } from '../main/shell/plugin-registry.js'

export const shellApi = {
  scheduleToday: (date?: string): Promise<{ ok: boolean; schedule?: TodaySchedule; error?: string }> =>
    ipcRenderer.invoke('shell:schedule-today', date ? { date } : {}),
  recentTasks: (limit = 10): Promise<{ ok: boolean; runs?: RunRecord[]; error?: string }> =>
    ipcRenderer.invoke('shell:recent-tasks', { limit }),
  onScheduleChanged: (cb: () => void) => {
    const fn = (): void => cb()
    ipcRenderer.on('shell:schedule-changed', fn)
    return () => {
      ipcRenderer.removeListener('shell:schedule-changed', fn)
    }
  },
  notificationsList: (): Promise<{ ok: boolean; notifications?: AppNotification[]; error?: string }> =>
    ipcRenderer.invoke('shell:notifications-list', {}),
  notificationCreate: (
    notification: Omit<AppNotification, 'id' | 'createdAt' | 'read'>
  ): Promise<{ ok: boolean; notification?: AppNotification; error?: string }> =>
    ipcRenderer.invoke('shell:notification-create', notification),
  notificationRead: (id: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('shell:notification-read', { id }),
  notificationsReadAll: (): Promise<{ ok: boolean; updated?: number; error?: string }> =>
    ipcRenderer.invoke('shell:notifications-read-all', {}),
  notificationDismiss: (id: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('shell:notification-dismiss', { id }),
  onNotificationsChanged: (cb: () => void) => {
    const fn = (): void => cb()
    ipcRenderer.on('shell:notifications-changed', fn)
    return () => {
      ipcRenderer.removeListener('shell:notifications-changed', fn)
    }
  },
  pluginsList: (): Promise<{ ok: boolean; plugins?: Plugin[]; error?: string }> =>
    ipcRenderer.invoke('shell:plugins-list', {}),
  pluginEnable: (id: string, enabled: boolean): Promise<{ ok: boolean; plugins?: Plugin[]; error?: string }> =>
    ipcRenderer.invoke('shell:plugin-enable', { id, enabled }),
  mcpList: (): Promise<{ ok: boolean; servers?: McpServerPublic[]; error?: string }> =>
    ipcRenderer.invoke('shell:mcp-list', {}),
  mcpUpsert: (config: McpServerConfig, secrets: Record<string, string>): Promise<{ ok: boolean; server?: McpServerPublic; error?: string }> =>
    ipcRenderer.invoke('shell:mcp-upsert', { config, secrets }),
  mcpStart: (id: string): Promise<{ ok: boolean; server?: McpServerPublic; error?: string }> =>
    ipcRenderer.invoke('shell:mcp-start', { id }),
  mcpStop: (id: string): Promise<{ ok: boolean; server?: McpServerPublic; error?: string }> =>
    ipcRenderer.invoke('shell:mcp-stop', { id }),
  mcpRemove: (id: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('shell:mcp-remove', { id }),
  agentsList: (): Promise<{ ok: boolean; agents?: AgentProfile[]; error?: string }> =>
    ipcRenderer.invoke('shell:agents-list', {}),
  agentCreate: (agent: Omit<AgentProfile, 'builtin'>): Promise<{ ok: boolean; agent?: AgentProfile; error?: string }> =>
    ipcRenderer.invoke('shell:agent-create', agent),
  agentUpdate: (id: string, agent: Omit<AgentProfile, 'builtin'>): Promise<{ ok: boolean; agent?: AgentProfile; error?: string }> =>
    ipcRenderer.invoke('shell:agent-update', { id, agent }),
  agentRemove: (id: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('shell:agent-remove', { id })
}
