import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, writeFile, readFile, copyFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { RunArtifactSchema, type RunArtifact } from '../../shared/contracts/artifacts.js'
import { extractArtifacts, sanitizeName, type DetectedArtifact } from './artifact-detect.js'

/** One artifact record as persisted; adds the on-disk file it caches. */
interface StoredArtifact extends RunArtifact {
  file: string
}

export interface RunArtifactStorage {
  load(): unknown
  save(records: StoredArtifact[]): void
}

const StoredArtifactListSchema = z.array(
  RunArtifactSchema.extend({ file: z.string().min(1) })
)

export interface ArtifactServiceOptions {
  /** Root directory for the cached artifact files (userData on the app). */
  baseDir: string
  storage: RunArtifactStorage
  /** Injectable for tests; the global fetch by default. */
  fetchImpl?: typeof fetch
}

/** Skip payloads above this; a downloader is not a database. */
export const MAX_ARTIFACT_BYTES = 30_000_000
const MAX_ARTIFACTS_PER_RUN = 20
const PREVIEW_MAX_BYTES = 2_500_000

/**
 * Capture, list, and hand out the files an automation run produced. Bytes are
 * cached under `<baseDir>/run-artifacts/<runId>/`; metadata lives in storage.
 */
export class RunArtifactService {
  private readonly baseDir: string
  private readonly storage: RunArtifactStorage
  private readonly fetchImpl: typeof fetch
  private readonly artifacts = new Map<string, StoredArtifact>()
  private readonly perRunCount = new Map<string, number>()

  constructor(options: ArtifactServiceOptions) {
    this.baseDir = options.baseDir
    this.storage = options.storage
    this.fetchImpl = options.fetchImpl ?? fetch
    this.load()
  }

  private load(): void {
    for (const record of StoredArtifactListSchema.default([]).parse(this.storage.load() ?? [])) {
      this.artifacts.set(record.id, record)
      this.perRunCount.set(record.runId, (this.perRunCount.get(record.runId) ?? 0) + 1)
    }
  }

  private persist(): void {
    this.storage.save([...this.artifacts.values()])
  }

  /**
   * Pull artifacts out of one tool result and cache the bytes. Called from the
   * agent emit path for every tool result; must never throw into the run.
   */
  async observeToolResult(runId: string, toolName: string, output: unknown): Promise<void> {
    try {
      const detected = extractArtifacts(toolName, output)
      if (detected.length === 0) return
      for (const artifact of detected) {
        await this.store(runId, artifact)
      }
      this.persist()
    } catch {
      // A failing artifact capture must not fail the run that produced it.
    }
  }

  private async store(runId: string, detected: DetectedArtifact): Promise<void> {
    if ((this.perRunCount.get(runId) ?? 0) >= MAX_ARTIFACTS_PER_RUN) return
    const bytes = await this.materialize(detected)
    if (!bytes || bytes.length === 0) return
    if (bytes.length > MAX_ARTIFACT_BYTES) return

    const index = (this.perRunCount.get(runId) ?? 0) + 1
    const safeName = sanitizeName(detected.name)
    const dir = path.join(this.baseDir, 'run-artifacts', runId)
    await mkdir(dir, { recursive: true })
    const file = path.join(dir, `${index}_${safeName}`)
    await writeFile(file, bytes)
    const now = Date.now()
    const record: StoredArtifact = {
      id: randomUUID(),
      runId,
      name: safeName,
      mime: detected.mime || mimeFromName(safeName),
      size: bytes.length,
      createdAt: now,
      file
    }
    this.artifacts.set(record.id, record)
    this.perRunCount.set(runId, index)
  }

  private async materialize(detected: DetectedArtifact): Promise<Buffer | undefined> {
    if (detected.url) {
      try {
        const res = await this.fetchImpl(detected.url, {
          signal: AbortSignal.timeout(30_000)
        })
      if (!res.ok) return undefined
      const buffer = Buffer.from(await res.arrayBuffer())
      if (buffer.length === 0) return undefined
      return buffer
    } catch {
      return undefined
    }
    }
    if (detected.base64) {
      try {
        return Buffer.from(detected.base64, 'base64')
      } catch {
        return undefined
      }
    }
    if (detected.text !== undefined) return Buffer.from(detected.text, 'utf8')
    return undefined
  }

  listForRun(runId: string): RunArtifact[] {
    return [...this.artifacts.values()]
      .filter((record) => record.runId === runId)
      .sort((a, b) => a.createdAt - b.createdAt)
      .map(({ file, ...rest }) => rest)
  }

  /** Copy one artifact into the downloads folder; returns the saved path. */
  async saveArtifact(artifactId: string, downloadsDir: string): Promise<{ ok: boolean; savedPath?: string; error?: string }> {
    const record = this.artifacts.get(artifactId)
    if (!record) return { ok: false, error: 'This file is no longer available.' }
    try {
      await mkdir(downloadsDir, { recursive: true })
      const target = uniquePath(path.join(downloadsDir, record.name))
      await copyFile(record.file, target)
      return { ok: true, savedPath: target }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  }

  /** Data URL preview for image artifacts; anything else returns no image. */
  async previewDataUrl(artifactId: string): Promise<{ ok: boolean; dataUrl?: string; error?: string }> {
    const record = this.artifacts.get(artifactId)
    if (!record) return { ok: false, error: 'This file is no longer available.' }
    if (!record.mime.startsWith('image/')) return { ok: true }
    try {
      const buffer = await readFile(record.file)
      if (buffer.length === 0 || buffer.length > PREVIEW_MAX_BYTES) return { ok: true }
      const dataUrl = `data:${record.mime};base64,${buffer.toString('base64')}`
      return { ok: true, dataUrl }
    } catch {
      return { ok: true }
    }
  }
}

/** `report.pdf` exists -> `report (1).pdf`, so a second save never clobbers. */
const existsPath = (candidate: string): boolean => existsSync(candidate)
const uniquePath = (target: string): string => {
  if (!existsPath(target)) return target
  const dir = path.dirname(target)
  const ext = path.extname(target)
  const stem = path.basename(target, ext)
  for (let n = 1; n < 1000; n++) {
    const candidate = path.join(dir, `${stem} (${n})${ext}`)
    if (!existsPath(candidate)) return candidate
  }
  return target
}

function mimeFromName(name: string): string {
  const ext = path.extname(name).toLowerCase()
  const found = Object.entries({
    pdf: 'application/pdf',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    csv: 'text/csv',
    md: 'text/markdown',
    html: 'text/html',
    json: 'application/json',
    zip: 'application/zip'
  }).find(([e]) => `.${e}` === ext)
  return found ? found[1] : ext === '.txt' ? 'text/plain' : 'application/octet-stream'
}
