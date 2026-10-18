import { tool, type ToolSet } from 'ai'
import { z } from 'zod'
import { COMPOSIO_USER_ID, markBudgetGuarded, realClient, type ComposioClientLike } from './composio.js'
import type { BudgetGuard } from './budget-guard.js'
import { currentOrFallbackContext } from '../agent/run-context.js'
import type { ConnectorProvider, ToolStatus } from './provider.js'
import type { ToolId } from '../../shared/types.js'

/**
 * Google Drive through Composio (free plan — every execution goes through
 * BudgetGuard; no polling, no triggers).
 *
 * API verified Oct 2026 against docs.composio.dev/toolkits/googledrive
 * (toolkit slug `GOOGLEDRIVE`, version `20261001_00`, re-checked 2026-10-18):
 * - Search/list: GOOGLEDRIVE_FIND_FILE (the list endpoint GOOGLEDRIVE_LIST_FILES
 *   is deprecated upstream). No page pagination in the picker: pageSize ≤ 25.
 * - Content: GOOGLEDRIVE_DOWNLOAD_FILE { fileId, mime_type? } →
 *   `downloaded_file_content` (native bytes for blobs, exported text/PDF for
 *   Google Workspace docs). Binary formats surface as untrusted data strings.
 * - Read-only: nothing here ever writes, deletes, or shares. No approval card
 *   needed (reads auto-run), but every call is still metered by BudgetGuard.
 */

export const DRIVE_TOOLKIT = 'googledrive'

export const DRIVE_LIST_SLUG = 'GOOGLEDRIVE_FIND_FILE'
export const DRIVE_GET_METADATA_SLUG = 'GOOGLEDRIVE_GET_FILE_METADATA'
export const DRIVE_DOWNLOAD_SLUG = 'GOOGLEDRIVE_DOWNLOAD_FILE'

/** Google Drive toolkit version pinned from the toolkit reference (2026-10-18). */
export const DRIVE_TOOLKIT_VERSION = '20261001_00'

/** Files per picker page. Kept small — picker loads are metered. */
export const DRIVE_MAX_RESULTS = 25

export const DRIVE_NOT_CONNECTED = 'DRIVE_NOT_CONNECTED'

const DRIVE_FIELDS = 'files(id,name,mimeType,size,modifiedTime,webViewLink)'

/** Export mime types accepted by GOOGLEDRIVE_DOWNLOAD_FILE (Workspace docs only). */
export const DRIVE_EXPORT_FORMATS = [
  'DOCX',
  'ODT',
  'RTF',
  'PDF',
  'TXT',
  'ZIP',
  'EPUB',
  'HTML',
  'Markdown',
  'XLSX',
  'ODS',
  'CSV',
  'TSV',
  'PPTX',
  'ODP',
  'JPEG',
  'PNG',
  'SVG'
] as const

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  size?: string
  modifiedTime?: string
  webViewLink?: string
}

export interface DriveDeps {
  getApiKey: () => Promise<string | null>
  fallbackApiKey?: string
  getGuard: () => BudgetGuard
  /** Injected in tests; production builds the real SDK client. */
  createClient?: (apiKey: string) => ComposioClientLike
}

function isVersionError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
  return /version/i.test(msg)
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function normalizeFile(m: unknown): DriveFile | null {
  if (typeof m !== 'object' || m === null) return null
  const o = m as Record<string, unknown>
  const id = str(o['id'])
  if (!id) return null
  const mimeType = str(o['mimeType']) || 'application/octet-stream'
  if (mimeType === 'application/vnd.google-apps.folder') return null
  return {
    id,
    name: str(o['name']) || '(untitled)',
    mimeType,
    size: str(o['size']) || undefined,
    modifiedTime: str(o['modifiedTime']) || undefined,
    webViewLink: str(o['webViewLink']) || undefined
  }
}

export class DriveService {
  private statusCache: { at: number; connected: boolean } | null = null

  constructor(private readonly deps: DriveDeps) {}

  private async client(): Promise<ComposioClientLike | null> {
    const apiKey = (await this.deps.getApiKey()) || this.deps.fallbackApiKey || null
    if (!apiKey) return null
    try {
      return this.deps.createClient ? this.deps.createClient(apiKey) : realClient(apiKey)
    } catch {
      return null
    }
  }

  private async isConnected(client: ComposioClientLike, force = false): Promise<boolean> {
    const now = Date.now()
    if (!force && this.statusCache && now - this.statusCache.at < 60_000) return this.statusCache.connected
    try {
      const res = await client.connectedAccounts.list({
        userIds: [COMPOSIO_USER_ID],
        toolkitSlugs: [DRIVE_TOOLKIT],
        statuses: ['ACTIVE']
      })
      const connected = (res.items ?? []).length > 0
      this.statusCache = { at: now, connected }
      return connected
    } catch {
      this.statusCache = null
      return false
    }
  }

  /**
   * List real Drive files for the picker. Costs zero on cache hits; one
   * BudgetGuard meter hit per uncached call (source 'palette', picker run).
   */
  async listFiles(query: string): Promise<{ ok: boolean; files?: DriveFile[]; notConnected?: boolean; error?: string }> {
    const client = await this.client()
    if (!client) return { ok: false, error: 'Add your Composio API key first (Settings → Connections).' }
    if (!(await this.isConnected(client))) {
      return { ok: false, notConnected: true, error: 'Connect Google Drive first.' }
    }
    const search = query.trim().slice(0, 120)
    try {
      const { result } = await this.deps.getGuard().execute({
        source: 'palette',
        runId: 'drive-picker',
        label: 'drive_list',
        cacheKey: `gdrive:list:${search}`,
        dedupeKey: `gdrive:list:${search}`,
        fn: () =>
          this.executeTool(client, DRIVE_LIST_SLUG, {
            ...(search ? { q: search } : {}),
            pageSize: DRIVE_MAX_RESULTS,
            fields: DRIVE_FIELDS,
            supportsAllDrives: true,
            includeItemsFromAllDrives: true
          })
      })
      const res = result as { data?: unknown; error?: string | null; successful?: boolean }
      if (res && res.error) return { ok: false, error: `Drive list failed: ${res.error}` }
      const data = (res as { data?: unknown })?.data ?? res
      const raw = (data as Record<string, unknown>)?.['files']
      const list = Array.isArray(raw) ? raw : Array.isArray(data) ? data : []
      return { ok: true, files: list.map(normalizeFile).filter((f): f is DriveFile => f !== null) }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  /**
   * Fetch one Drive file's content for the agent (read-only). Workspace docs
   * are exported to `exportFormat`; native blob files come back as-is and
   * large or binary payloads are truncated/flagged, never silently swallowed.
   */
  async readFile(
    fileId: string,
    exportFormat?: (typeof DRIVE_EXPORT_FORMATS)[number]
  ): Promise<unknown> {
    const client = await this.client()
    if (!client) return DRIVE_NOT_CONNECTED
    if (!(await this.isConnected(client))) {
      return `${DRIVE_NOT_CONNECTED} — Google Drive is not connected. Tell the user to open Settings → Connections and connect Google Drive. Do not invent file contents.`
    }
    if (!/^[A-Za-z0-9_-]+$/.test(fileId)) return `Invalid Drive file id: ${fileId}`
    const { runId, source } = currentOrFallbackContext()
    try {
      const { result, cached } = await this.deps.getGuard().execute({
        source,
        runId,
        label: 'gdrive_read',
        cacheKey: `gdrive:read:${fileId}:${exportFormat ?? ''}`,
        dedupeKey: `gdrive:read:${fileId}:${exportFormat ?? ''}`,
        fn: () =>
          this.executeTool(client, DRIVE_DOWNLOAD_SLUG, {
            fileId,
            ...(exportFormat ? { mime_type: exportFormat } : {})
          })
      })
      const res = result as { data?: unknown; error?: string | null; successful?: boolean }
      if (res && res.error) return `Drive read failed: ${res.error}`
      const data = (res as { data?: unknown })?.data ?? res
      const payload = extractContent(data)
      return { fetched: true, cached, fileId, exportFormat, ...payload }
    } catch (err) {
      return `Drive read failed: ${err instanceof Error ? err.message : String(err)}`
    }
  }

  async status(): Promise<ToolStatus> {
    const client = await this.client()
    if (!client) return { connected: false, detail: 'No Composio API key set.' }
    this.statusCache = null
    const connected = await this.isConnected(client)
    return {
      connected,
      detail: connected ? 'Google Drive connected via Composio.' : 'No active Google Drive connection.'
    }
  }

  private async executeTool(
    client: ComposioClientLike,
    slug: string,
    args: Record<string, unknown>
  ): Promise<{ data?: unknown; error?: string | null; successful?: boolean }> {
    try {
      return await client.tools.execute(slug, {
        userId: COMPOSIO_USER_ID,
        version: DRIVE_TOOLKIT_VERSION,
        arguments: args
      })
    } catch (err) {
      if (!isVersionError(err)) throw err
      return client.tools.execute(slug, {
        userId: COMPOSIO_USER_ID,
        arguments: args,
        dangerouslySkipVersionCheck: true
      })
    }
  }
}

const CONTENT_MAX_CHARS = 200_000

/**
 * Pull a usable text payload out of the download envelope without guessing:
 * `downloaded_file_content` may be a plain string, or an object (s3url etc.)
 * as the long-running variant documents. Anything else is surfaced as data.
 */
function extractContent(data: unknown): { content?: string; raw?: unknown } {
  if (typeof data === 'string') return { content: maybeTruncate(data) }
  if (typeof data !== 'object' || data === null) return { raw: data }
  const o = data as Record<string, unknown>
  const content = o['downloaded_file_content'] ?? o['content']
  if (typeof content === 'string') return { content: maybeTruncate(content) }
  if (typeof content === 'object' && content !== null) {
    const c = content as Record<string, unknown>
    const s3url = typeof c['s3url'] === 'string' ? c['s3url'] : undefined
    if (s3url) {
      return {
        content: undefined,
        raw: { s3url, note: 'Short-lived URL returned; fetch bytes promptly if the agent needs them.' }
      }
    }
    const base64 = typeof c['base64'] === 'string' ? c['base64'] : undefined
    if (base64) return { raw: { binary: 'base64', note: 'Non-text payload returned as base64 data — the agent only reads text.' } }
  }
  return { raw: data }
}

function maybeTruncate(content: string): string {
  if (content.length <= CONTENT_MAX_CHARS) return content
  return `${content.slice(0, CONTENT_MAX_CHARS)}\n…(truncated: content exceeded ${CONTENT_MAX_CHARS} characters)`
}

/** Agent tool surface: gdrive_read under the @composio mention (read-only). */
export class DriveConnectorProvider implements ConnectorProvider {
  readonly id = 'composio-gdrive'
  private readonly service: DriveService

  constructor(deps: DriveDeps) {
    this.service = new DriveService(deps)
  }

  getTools(toolIds: ToolId[]): ToolSet {
    if (!toolIds.includes('composio')) return {}
    const reader = tool({
      description:
        'Fetch the content of one Google Drive file by fileId (read-only). Use the fileId given in the prompt, e.g. from an attached Drive file chip. Google Workspace docs export to PDF by default; pass exportFormat (e.g. TXT, CSV) to pick the text format.',
      inputSchema: z.object({
        fileId: z.string().min(10).max(128).describe('Google Drive file id from the prompt or a previous gt search'),
        exportFormat: z.enum(DRIVE_EXPORT_FORMATS).optional()
      }),
      execute: async (input) => this.service.readFile(input.fileId, input.exportFormat)
    })
    markBudgetGuarded(reader as object)
    return { gdrive_read: reader } as unknown as ToolSet
  }

  status(): Promise<ToolStatus> {
    return this.service.status()
  }

  async connect(): Promise<{ ok: boolean; url?: string; error?: string }> {
    // Connect is driven by the renderer through the Composio marketplace
    // session flow (composio:connect with toolkit 'googledrive').
    return { ok: false, error: 'Connect Google Drive from Settings → Connections, or the Drive picker Connect button.' }
  }
}
