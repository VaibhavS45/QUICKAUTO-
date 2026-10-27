import { z } from 'zod'
import { IpcChannels } from '../../ipc.js'
import { AutomationCreateSchema, AutomationPatchSchema } from '../../../shared/contracts/automations.js'
import type { AutomationService } from './automation-service.js'

/**
 * Scheduled Tasks IPC. One channel per REST operation the feature needs
 * (list / get / create / update / delete / pause / resume / test-run / runs).
 */

const IdSchema = z.object({ id: z.string().min(1).max(128) }).strict()

export interface AutomationIpcRegistrar {
  handle(channel: string, listener: (_event: unknown, payload?: unknown) => unknown): void
}

export function registerAutomationIpc(
  ipc: AutomationIpcRegistrar,
  service: AutomationService,
  listRuns: (id: string) => Promise<import('../../../shared/contracts/schedule.js').RunRecord[]>
): void {
  ipc.handle(IpcChannels.automationList, () => ({ ok: true as const, automations: service.list() }))

  ipc.handle(IpcChannels.automationGet, (_event, payload: unknown) => {
    const parsed = IdSchema.safeParse(payload)
    if (!parsed.success) return { ok: false as const, error: 'Invalid automation id.' }
    const automation = service.get(parsed.data.id)
    return automation
      ? { ok: true as const, automation }
      : { ok: false as const, error: 'Automation not found.' }
  })

  ipc.handle(IpcChannels.automationCreate, (_event, payload: unknown) => {
    const parsed = AutomationCreateSchema.safeParse(payload)
    if (!parsed.success) return { ok: false as const, error: 'Invalid automation.' }
    try {
      return { ok: true as const, automation: service.create(parsed.data) }
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipc.handle(IpcChannels.automationUpdate, (_event, payload: unknown) => {
    const parsed = z.object({ id: z.string().min(1).max(128), patch: AutomationPatchSchema }).safeParse(payload)
    if (!parsed.success) return { ok: false as const, error: 'Invalid automation update.' }
    try {
      const automation = service.update(parsed.data.id, parsed.data.patch)
      return automation
        ? { ok: true as const, automation }
        : { ok: false as const, error: 'Automation not found.' }
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipc.handle(IpcChannels.automationDelete, (_event, payload: unknown) => {
    const parsed = IdSchema.safeParse(payload)
    if (!parsed.success) return { ok: false as const, error: 'Invalid automation id.' }
    return service.remove(parsed.data.id)
      ? { ok: true as const }
      : { ok: false as const, error: 'Automation not found.' }
  })

  ipc.handle(IpcChannels.automationPause, (_event, payload: unknown) => {
    const parsed = IdSchema.safeParse(payload)
    if (!parsed.success) return { ok: false as const, error: 'Invalid automation id.' }
    try {
      const automation = service.setStatus(parsed.data.id, 'paused')
      return automation
        ? { ok: true as const, automation }
        : { ok: false as const, error: 'Automation not found.' }
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipc.handle(IpcChannels.automationResume, (_event, payload: unknown) => {
    const parsed = IdSchema.safeParse(payload)
    if (!parsed.success) return { ok: false as const, error: 'Invalid automation id.' }
    try {
      const automation = service.setStatus(parsed.data.id, 'active')
      return automation
        ? { ok: true as const, automation }
        : { ok: false as const, error: 'Automation not found.' }
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : String(error) }
    }
  })

  ipc.handle(IpcChannels.automationTestRun, (_event, payload: unknown) => {
    const parsed = IdSchema.safeParse(payload)
    if (!parsed.success) return { ok: false as const, error: 'Invalid automation id.' }
    const runId = service.testRun(parsed.data.id)
    return runId === null
      ? { ok: false as const, error: 'Automation not found.' }
      : { ok: true as const, runId }
  })

  ipc.handle(IpcChannels.automationRuns, async (_event, payload: unknown) => {
    const parsed = IdSchema.safeParse(payload)
    if (!parsed.success) return { ok: false as const, error: 'Invalid automation id.' }
    return { ok: true as const, runs: await listRuns(parsed.data.id) }
  })
}
