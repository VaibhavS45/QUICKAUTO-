/**
 * Detecting file-like payloads inside a tool result. Tool outputs are
 * `unknown`: a plain string, a Composio envelope (`{ successful, data }`),
 * or a nested object carrying file content. Detection stays pure: it only
 * reads the shape and hands the bytes (or a URL) to the artifact store.
 */

export interface DetectedArtifact {
  /** Sanitised display name (no path separators, length-capped). */
  name: string
  /** Best-effort MIME type; defaults drive the extension fallback. */
  mime: string
  /** Base64-encoded bytes, when the payload carried them. */
  base64?: string
  /** Plain text payload, when the result was textual. */
  text?: string
  /** Short-lived URL (Composio exports) whose bytes must be fetched promptly. */
  url?: string
}

const MAX_ARTIFACTS_PER_RESULT = 5
const BASE64_MAX_CHARS = 40_000_000

const NAME_KEYS = ['file_name', 'filename', 'fileName', 'name']
const MIME_KEYS = ['mime_type', 'mimeType', 'content_type', 'contentType']
const CONTENT_STRING_KEYS = ['downloaded_file_content']
const B64_KEYS = ['base64', 'content_base64']

const MIME_EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'text/markdown': 'md',
  'text/html': 'html',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'application/json': 'json',
  'text/json': 'json',
  'application/zip': 'zip'
}

/**
 * Turn raw tool output into artifact descriptors. Bounded walk (depth 4) so a
 * huge result cannot stall the run; at most MAX_ARTIFACTS_PER_RESULT files.
 */
export function extractArtifacts(toolName: string, output: unknown): DetectedArtifact[] {
  const found: DetectedArtifact[] = []
  walk(output, 0, {}, found)
  return found.map((artifact, index) => withDefaults(artifact, toolName, index))
}

function withDefaults(artifact: DetectedArtifact, toolName: string, index: number): DetectedArtifact {
  return {
    ...artifact,
    name: sanitizeName(artifact.name || `${toolName}-file-${index + 1}.${extensionFor(artifact.mime)}`)
  }
}

function walk(node: unknown, depth: number, context: { name?: string; mime?: string }, found: DetectedArtifact[]): void {
  if (found.length >= MAX_ARTIFACTS_PER_RESULT) return
  if (typeof node !== 'object' || node === null) return
  if (depth > 4) return

  const o = node as Record<string, unknown>

  const name = firstString(o, NAME_KEYS) ?? context.name
  const mime = firstString(o, MIME_KEYS) ?? context.mime
  const localContext = { name, mime }

  // 1) Explicit content field (Composio download envelope).
  for (const key of CONTENT_STRING_KEYS) {
    const value = o[key]
    if (typeof value !== 'string') continue
    fromStringContent(value, localContext, found)
    return
  }

  // 2) Standalone base64 field.
  for (const key of B64_KEYS) {
    const value = o[key]
    if (typeof value === 'string' && value.length > 0 && isLikelyBase64(value)) {
      found.push({ name: name ?? '', mime: mime ?? 'application/octet-stream', base64: value })
      return
    }
  }

  // 3) Short-lived export URL (PDF/Excel exports).
  for (const key of ['s3url', 'download_url', 'url']) {
    const value = o[key]
    if (typeof value === 'string' && /^https?:\/\//.test(value)) {
      // Only treat as a file when something says "file": a filename/mime on this
      // level, or the key itself names a file. Bare links to web pages are not artifacts.
      const namesFile = key === 's3url' || key === 'download_url' || mime !== undefined || name !== undefined
      if (namesFile) {
        found.push({ name: name ?? '', mime: mime ?? 'application/octet-stream', url: value })
        return
      }
    }
  }

  // 4) Nested: descend into objects/arrays first, carrying the context. Only
  // when nothing nested turned up do plain strings get treated as file bodies
  // (a filename string sitting next to real content must not become a second
  // artifact).
  const before = found.length
  for (const value of Object.values(o)) {
    if (found.length >= MAX_ARTIFACTS_PER_RESULT) return
    if (typeof value === 'object' && value !== null) {
      walk(value, depth + 1, localContext, found)
    }
  }
  if (found.length > before) return
  for (const value of Object.values(o)) {
    if (found.length >= MAX_ARTIFACTS_PER_RESULT) return
    if (typeof value === 'string' && looksLikeBody(value) && keySaysFile(value, Object.keys(o))) {
      // A plain string paired with a filename equals a file body.
      fromStringContent(value, localContext, found)
    }
  }
}

/** Filenames are short and id-like; real bodies are data URLs, base64, or long text. */
function looksLikeBody(value: string): boolean {
  return value.startsWith('data:') || (isLikelyBase64(value) && value.length > 64) || value.length >= 160
}

/** Content string that may be text, base64 bytes, or a data: URL. */
function fromStringContent(
  content: string,
  context: { name?: string; mime?: string },
  found: DetectedArtifact[]
): void {
  const name = context.name ?? ''
  const mime = context.mime
  const dataUrl = /^data:([^;,]+)(;charset=[^;,]+)?;base64,(.+)$/.exec(content.slice(0, 256))
  if (dataUrl && dataUrl[3] && dataUrl[1]) {
    found.push({ name, mime: dataUrl[1], base64: dataUrl[3] })
    return
  }
  if (content.length <= BASE64_MAX_CHARS && isLikelyBase64(content) && content.length > 64) {
    found.push({ name, mime: mime ?? 'application/octet-stream', base64: content })
    return
  }
  found.push({ name, mime: mime ?? 'text/plain', text: content })
}

function keySaysFile(value: string, keys: string[]): boolean {
  return keys.some((key) => /file|content|blob|body/.test(key)) && !/^https?:\/\//.test(value)
}

function firstString(o: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = o[key]
    if (typeof value === 'string' && value.length > 0) return value
  }
  return undefined
}

/** Base64 without padding noise: length %4 and charset checks, not decoding. */
function isLikelyBase64(value: string): boolean {
  if (value.length % 4 !== 0) return false
  return /^[A-Za-z0-9+/]+={0,2}$/.test(value)
}

/** Strip directories and unsafe characters; keep the display name short. */
export function sanitizeName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? ''
  const clean = base.replace(/[\u0000-\u001f<>:"|?*]/g, '').trim()
  return clean.slice(0, 120) || 'file'
}

export function extensionFor(mime: string): string {
  return MIME_EXTENSIONS[mime.toLowerCase()] ?? 'bin'
}
