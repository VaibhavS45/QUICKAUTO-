import { useCallback, useState } from 'react'

/**
 * Shared attach flow for the automation builder and the main chat composer.
 * Chosen files are stored in state as {ref, name} and rendered as chips —
 * they are never only appended to the prompt text. The local paths come from
 * the main-process `dialog.showOpenDialog` IPC (`window.app.openFileDialog`),
 * so real filesystem paths are available even though renderer `File` objects
 * do not expose one in Electron.
 */

export type AttachmentKind = 'local' | 'drive'

export interface AttachedFile {
  /** Stable identity for dedupe + removal: the local path or `drive:<id>`. */
  ref: string
  name: string
  kind: AttachmentKind
  /** Drive file id when kind === 'drive'. */
  driveId?: string
}

export function baseName(filePath: string): string {
  const n = filePath.split(/[\\/]/).pop() ?? filePath
  return n.length > 0 ? n : filePath
}

/** Local chip reference for a picked path. */
export function localRef(filePath: string): string {
  return filePath
}

/** Drive chip reference for a selected Drive file. */
export function driveRef(fileId: string): string {
  return `drive:${fileId}`
}

/** Parse a `drive:<fileId>` reference back into a file id, or null. */
export function driveIdOf(ref: string): string | null {
  if (!ref.startsWith('drive:')) return null
  const id = ref.slice(6)
  return /^[A-Za-z0-9_-]+$/.test(id) && id.length > 0 ? id : null
}

/** Merge new attachments into existing ones; the same file only appears once. */
export function mergeAttachments(prev: AttachedFile[], incoming: AttachedFile[]): AttachedFile[] {
  const seen = new Set(prev.map((f) => f.ref.toLowerCase()))
  const added: AttachedFile[] = []
  for (const f of incoming) {
    const key = f.ref.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    added.push(f)
  }
  return [...prev, ...added]
}

/**
 * How attached files are described to the agent: locals as `@/path` (a tool
 * mention whose slash variants are ignored by @mention parsing), Drive files
 * as a readable reference with the fileId so a Drive read tool can fetch it.
 */
export function attachmentPromptText(files: AttachedFile[]): string {
  const parts: string[] = []
  for (const f of files) {
    if (f.kind === 'local') {
      parts.push(`@${f.ref}`)
    } else if (f.driveId) {
      parts.push(`Google Drive file "${f.name}" (fileId: ${f.driveId})`)
    }
  }
  return parts.join(' ')
}

/** True when at least one attached file needs Composio tools to be reachable. */
export function needsComposioTools(files: AttachedFile[]): boolean {
  return files.some((f) => f.kind === 'drive')
}

export function useAttachments(): {
  files: AttachedFile[]
  error: string
  attachLocal: () => Promise<void>
  attachDrive: (file: { id: string; name: string; mimeType?: string }) => void
  remove: (ref: string) => void
  setError: (message: string) => void
} {
  const [files, setFiles] = useState<AttachedFile[]>([])
  const [error, setError] = useState('')

  const attachLocal = useCallback(async (): Promise<void> => {
    setError('')
    try {
      const result = await window.app.openFileDialog({ multiple: true })
      if (!result.ok) {
        setError(result.error ?? 'Could not open the file picker.')
        return
      }
      if (result.canceled || !result.filePaths || result.filePaths.length === 0) return
      const incoming = result.filePaths.map((filePath) => ({
        ref: localRef(filePath),
        name: baseName(filePath),
        kind: 'local' as const
      }))
      setFiles((prev) => mergeAttachments(prev, incoming))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  const attachDrive = useCallback((file: { id: string; name: string; mimeType?: string }): void => {
    if (!/^[A-Za-z0-9_-]+$/.test(file.id)) {
      setError('That Drive item has an invalid id.')
      return
    }
    setError('')
    setFiles((prev) =>
      mergeAttachments(prev, [
        {
          ref: driveRef(file.id),
          name: file.name,
          kind: 'drive',
          driveId: file.id
        }
      ])
    )
  }, [])

  const remove = useCallback((ref: string): void => {
    setFiles((prev) => prev.filter((f) => f.ref !== ref))
  }, [])

  return { files, error, attachLocal, attachDrive, remove, setError }
}
