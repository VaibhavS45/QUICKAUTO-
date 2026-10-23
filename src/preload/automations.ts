import { ipcRenderer } from 'electron'
import type { Automation, AutomationCreate, AutomationPatch } from '../shared/contracts/automations.js'
import type { RunRecord } from '../shared/contracts/schedule.js'

/**
 * Scheduled Tasks API. Mirrors the REST surface (list / get / create / update /
 * delete / pause / resume / test-run / runs) over IPC.
 */
export const automationsApi = {
  automationsList: (): Promise<{ ok: boolean; automations?: Automation[]; error?: string }> =>
    ipcRenderer.invoke('automation:list'),
  automationsGet: (id: string): Promise<{ ok: boolean; automation?: Automation; error?: string }> =>
    ipcRenderer.invoke('automation:get', { id }),
  automationsCreate: (
    input: AutomationCreate
  ): Promise<{ ok: boolean; automation?: Automation; error?: string }> =>
    ipcRenderer.invoke('automation:create', input),
  automationsUpdate: (
    id: string,
    patch: AutomationPatch
  ): Promise<{ ok: boolean; automation?: Automation; error?: string }> =>
    ipcRenderer.invoke('automation:update', { id, patch }),
  automationsDelete: (id: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke('automation:delete', { id }),
  automationsPause: (id: string): Promise<{ ok: boolean; automation?: Automation; error?: string }> =>
    ipcRenderer.invoke('automation:pause', { id }),
  automationsResume: (id: string): Promise<{ ok: boolean; automation?: Automation; error?: string }> =>
    ipcRenderer.invoke('automation:resume', { id }),
  automationsTestRun: (id: string): Promise<{ ok: boolean; runId?: string; error?: string }> =>
    ipcRenderer.invoke('automation:test-run', { id }),
  automationsRuns: (id: string): Promise<{ ok: boolean; runs?: RunRecord[]; error?: string }> =>
    ipcRenderer.invoke('automation:runs', { id })
}
