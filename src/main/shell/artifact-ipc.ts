import { z } from 'zod'
import { app } from 'electron'
import { IpcChannels } from '../ipc.js'
import type { RunArtifactService } from './run-artifacts.js'

export const RunArtifactListRequestSchema = z.object({
  runId: z.string().min(1).max(128)
}).strict()

export const RunArtifactIdRequestSchema = z.object({
  artifactId: z.string().min(1).max(128)
}).strict()

type RunArtifactChannel =
  | typeof IpcChannels.runArtifactsList
  | typeof IpcChannels.runArtifactsSave
  | typeof IpcChannels.runArtifactsPreview

export interface ArtifactIpcRegistrar {
  handle(channel: RunArtifactChannel, listener: (_event: unknown, payload?: unknown) => unknown): void
}

/** Renderer-facing artifact channels: list, save to Downloads, and preview. */
export function registerArtifactIpc(ipc: ArtifactIpcRegistrar, artifacts: RunArtifactService): void {
  ipc.handle(IpcChannels.runArtifactsList, (_event, payload) => {
    const parsed = RunArtifactListRequestSchema.safeParse(payload)
    if (!parsed.success) return { ok: false as const, error: 'Invalid artifact request.' }
    return { ok: true as const, artifacts: artifacts.listForRun(parsed.data.runId) }
  })

  ipc.handle(IpcChannels.runArtifactsSave, async (_event, payload) => {
    const parsed = RunArtifactIdRequestSchema.safeParse(payload)
    if (!parsed.success) return { ok: false as const, error: 'Invalid artifact request.' }
    return artifacts.saveArtifact(parsed.data.artifactId, app.getPath('downloads'))
  })

  ipc.handle(IpcChannels.runArtifactsPreview, (_event, payload) => {
    const parsed = RunArtifactIdRequestSchema.safeParse(payload)
    if (!parsed.success) return { ok: false as const, error: 'Invalid artifact request.' }
    return artifacts.previewDataUrl(parsed.data.artifactId)
  })
}
