import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  RunArtifactService,
  MAX_ARTIFACT_BYTES,
  type RunArtifactStorage
} from '../../src/main/shell/run-artifacts.js'

function makeStorage(persisted: unknown[] = []): RunArtifactStorage & { dump(): unknown[] } {
  const records: unknown[] = persisted
  return {
    load: () => records,
    save: (next) => {
      records.splice(0, records.length)
      records.push(...next)
    },
    dump: () => records
  }
}

async function makeService(extra: Partial<{ fetchImpl: typeof fetch }> = {}): Promise<RunArtifactService> {
  const baseDir = await mkdtemp(path.join(tmpdir(), 'palette-artifacts-'))
  return new RunArtifactService({ baseDir, storage: makeStorage(), ...extra })
}

describe('RunArtifactService', () => {
  it('stores a base64 payload and lists it without the disk path', async () => {
    const service = await makeService()
    const b64 = Buffer.from('%PDF-1.4 fake').toString('base64')
    await service.observeToolResult('run-1', 'drive_export_file', {
      data: { file_name: 'report.pdf', base64: b64 }
    })
    const list = service.listForRun('run-1')
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ name: 'report.pdf', runId: 'run-1' })
    expect(list[0]).not.toHaveProperty('file')
  })

  it('saves an artifact into the downloads folder', async () => {
    const service = await makeService()
    await service.observeToolResult('run-1', 't', {
      data: { file_name: 'report.txt', mime_type: 'text/plain', base64: Buffer.from('hello').toString('base64') }
    })
    const artifact = service.listForRun('run-1')[0]!
    const downloads = await mkdtemp(path.join(tmpdir(), 'palette-downloads-'))
    const res = await service.saveArtifact(artifact.id, downloads)
    expect(res.ok).toBe(true)
    await expect(readFile(res.savedPath!, 'utf8')).resolves.toBe('hello')
  })

  it('does not clobber an existing file in Downloads on a second save', async () => {
    const service = await makeService()
    await service.observeToolResult('run-1', 't', {
      data: { file_name: 'same.txt', mime_type: 'text/plain', base64: Buffer.from('first').toString('base64') }
    })
    const artifact = service.listForRun('run-1')[0]!
    const downloads = await mkdtemp(path.join(tmpdir(), 'palette-downloads-'))
    const first = await service.saveArtifact(artifact.id, downloads)
    const second = await service.saveArtifact(artifact.id, downloads)
    expect(second.savedPath).not.toBe(first.savedPath)
    await expect(readFile(first.savedPath!, 'utf8')).resolves.toBe('first')
  })

  it('streams a short-lived export URL into a cached file', async () => {
    const fetchImpl = (async () => new Response(Buffer.from('%PDF bytes'), { status: 200 })) as typeof fetch
    const baseDir = await mkdtemp(path.join(tmpdir(), 'palette-artifacts-'))
    const storage = makeStorage()
    const service = new RunArtifactService({ baseDir, storage, fetchImpl })
    await service.observeToolResult('run-1', 'drive_export_file', {
      data: { file_name: 'doc.pdf', downloaded_file_content: { s3url: 'https://s3.example/x', mimeType: 'application/pdf' } }
    })
    const artifact = service.listForRun('run-1')[0]!
    expect(artifact.mime).toBe('application/pdf')
    await expect(readFile(path.join(baseDir, 'run-artifacts', 'run-1', `1_${artifact.name}`), 'utf8')).resolves.toBe('%PDF bytes')
  })

  it('skips URL payloads the fetch cannot get', async () => {
    const fetchImpl = (async () => new Response('nope', { status: 404 })) as typeof fetch
    const baseDir = await mkdtemp(path.join(tmpdir(), 'palette-artifacts-'))
    const service = new RunArtifactService({ baseDir, storage: makeStorage(), fetchImpl })
    await service.observeToolResult('run-1', 't', {
      data: { file_name: 'doc.pdf', downloaded_file_content: { s3url: 'https://s3.example/x' } }
    })
    expect(service.listForRun('run-1')).toHaveLength(0)
  })

  it('returns an image data URL preview and nothing for non-images', async () => {
    const service = await makeService()
    const png = Buffer.from([0x89, 0x50]).toString('base64')
    await service.observeToolResult('run-1', 't', {
      data: { file_name: 'img.png', mime_type: 'image/png', base64: png }
    })
    const artifact = service.listForRun('run-1')[0]!
    const preview = await service.previewDataUrl(artifact.id)
    expect(preview.ok).toBe(true)
    expect(preview.dataUrl).toBe(`data:image/png;base64,${png}`)
    expect(preview.dataUrl?.length).toBeLessThan(100)
  })

  it('persists metadata and reloads it into a fresh service', async () => {
    const storage = makeStorage()
    const baseDir = await mkdtemp(path.join(tmpdir(), 'palette-artifacts-'))
    const first = new RunArtifactService({ baseDir, storage })
    const b64 = Buffer.from('archive me').toString('base64')
    await first.observeToolResult('run-1', 't', { data: { file_name: 'notes.txt', base64: b64 } })
    expect(storage.dump().length).toBe(1)

    const second = new RunArtifactService({ baseDir, storage })
    expect(second.listForRun('run-1')).toHaveLength(1)
  })

  it('never throws into the run when the payload is garbage', async () => {
    const service = await makeService()
    await expect(service.observeToolResult('run-1', 'broken', {
      get data(): unknown {
        throw new Error('boom')
      }
    })).resolves.toBeUndefined()
  })

  it('caps per-run artifact count', async () => {
    const service = await makeService()
    for (let i = 0; i < 25; i++) {
      await service.observeToolResult('run-1', 't', {
        data: { file_name: `f${i}.txt`, downloaded_file_content: `file number ${i} body `.repeat(10) }
      })
    }
    expect(service.listForRun('run-1')).toHaveLength(20)
  })

  it('skips oversized payloads', async () => {
    const service = await makeService()
    const b64 = Buffer.alloc(MAX_ARTIFACT_BYTES + 1024).toString('base64')
    await service.observeToolResult('run-1', 't', { data: { file_name: 'big.bin', base64: b64 } })
    expect(service.listForRun('run-1')).toHaveLength(0)
  })

  it('returns a friendly error when saving an unknown artifact', async () => {
    const service = await makeService()
    const downloads = await mkdtemp(path.join(tmpdir(), 'palette-downloads-'))
    const res = await service.saveArtifact('nope', downloads)
    expect(res.ok).toBe(false)
    await expect(writeFile(path.join(downloads, 'z.txt'), 'z')).resolves.toBeUndefined()
  })

  it('lists other runs separately', async () => {
    const service = await makeService()
    await service.observeToolResult('run-1', 't', { data: { file_name: 'a.txt', downloaded_file_content: 'run one content, padded so it counts as a body'.repeat(5) } })
    await service.observeToolResult('run-2', 't', { data: { file_name: 'b.txt', downloaded_file_content: 'run two content, also padded so it counts as a body'.repeat(5) } })
    expect(service.listForRun('run-1').map((a) => a.name)).toEqual(['a.txt'])
  })
})
