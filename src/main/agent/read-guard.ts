import { homedir } from 'node:os'
import path from 'node:path'
import { realpath } from 'node:fs/promises'
import { realpathSync, statSync } from 'node:fs'
import { getRunContext, type RunContext } from './run-context.js'
import { requestNestedApprovalForCurrentRun } from './nested-approval.js'

/**
 * Read guard for built-in reads (read_file). Three rules:
 * 1) Sensitive credentials/keys/env files are never readable into model
 *    context (checked on BOTH the lexical path and the realpath, so symlink
 *    aliases cannot bypass the deny list).
 * 2) Scheduled runs (headless — no approval card can answer) read only
 *    inside folders shared with the task (parsed from the @/path mentions
 *    the user attached/referenced). Fail-closed.
 * 3) Interactive runs ingest untrusted web/email content: reads outside the
 *    shared folders then require an in-app approve/deny card via the existing
 *    nested-approval bridge.
 */

/** Tool names whose results carry untrusted external content (web/email/app data). */
export const UNTRUSTED_RESULT_TOOLS: ReadonlySet<string> = new Set([
  'web_search',
  'gmail_search',
  'gmail_get',
  'gmail_labels',
  'composio_search',
  'composio_execute'
])

/** Calls the runner makes when such a tool produced a call/result. */
export function noteUntrustedIngested(toolName: string): void {
  const ctx = getRunContext()
  if (!ctx || ctx.untrustedIngested) return
  if (UNTRUSTED_RESULT_TOOLS.has(toolName) || toolName.startsWith('mcp_')) {
    ctx.untrustedIngested = true
  }
}

function isSensitiveBasename(basename: string): boolean {
  const lower = basename.toLowerCase()
  // Narrowed (Phase 4): deny real key files, not any `id_*`/`.env*` blob.
  if (
    lower.startsWith('id_rsa') ||
    lower.startsWith('id_ed25519') ||
    lower.startsWith('id_ecdsa') ||
    lower.startsWith('id_dsa')
  ) {
    return true
  }
  if (lower === '.env' || lower === '.envrc' || lower.startsWith('.env.')) return true
  if (lower.endsWith('.pem') || lower.endsWith('.key')) return true
  return false
}

function sensitiveDenial(candidates: string[]): string | null {
  const home = path.resolve(homedir())
  const sensitiveDirs = [
    '.ssh',
    '.aws',
    '.gnupg',
    path.join('.config', 'gcloud'),
    '.kube',
    '.mozilla',
    path.join('.config', 'google-chrome'),
    path.join('.config', 'chromium'),
    path.join('.config', 'BraveSoftware')
  ].map((rel) => path.join(home, rel))
  const sensitiveFiles = ['.npmrc', '.netrc', '.git-credentials', path.join('.docker', 'config.json')].map(
    (rel) => path.join(home, rel)
  )
  for (const cand of candidates) {
    const norm = cand.endsWith(path.sep) ? cand.slice(0, -1) : cand
    if (
      sensitiveDirs.some((d) => norm === d || norm.startsWith(`${d}${path.sep}`)) ||
      sensitiveFiles.some((f) => norm === f) ||
      isSensitiveBasename(path.basename(norm))
    ) {
      return norm
    }
  }
  return null
}

async function isInsideRoots(candidates: string[], roots: string[]): Promise<boolean> {
  for (const root of roots) {
    let effective = path.resolve(root)
    try {
      effective = await realpath(effective)
    } catch {
      // Missing shared root: compare lexically as-is.
    }
    for (const cand of candidates) {
      if (cand === effective || cand.startsWith(`${effective}${path.sep}`)) return true
    }
  }
  return false
}

/**
 * Throws when the read is not allowed under the W3 policy. Call only after
 * the plain allowed-roots check has passed. No run context → legacy permit
 * (direct unit-test calls; production always runs inside a context).
 */
export async function guardRead(filePath: string): Promise<void> {
  const resolved = path.resolve(filePath.trim())
  const candidates = [resolved]
  try {
    candidates.push(await realpath(resolved))
  } catch {
    // Missing file: let the normal stat/read error handling produce ENOENT.
  }
  if (sensitiveDenial(candidates)) {
    throw new Error(
      `Refusing to read a sensitive file (credentials, private keys, env or browser profile data): ${filePath}`
    )
  }
  const ctx: RunContext | undefined = getRunContext()
  if (!ctx || !ctx.sharedFolders) return
  if (await isInsideRoots(candidates, ctx.sharedFolders)) return
  if (ctx.source === 'scheduled') {
    throw new Error(
      `Scheduled runs can only read files inside the folders shared with the task: ${filePath}`
    )
  }
  if (!ctx.untrustedIngested) return
  const decision = await requestNestedApprovalForCurrentRun({
    toolName: 'read_file',
    input: { path: filePath },
    reason:
      'This run has ingested web or email content and asks to read a file outside the folders shared with the task.'
  })
  if (!decision.approved) {
    throw new Error(`Reading outside shared folders was denied by approval. ${decision.reason ?? ''}`.trim())
  }
}

/**
 * Shared folders for a run (Phase 4): parsed ONLY from user-authored text —
 * the live prompt and history user messages. Assistant/tool/web text can
 * name paths all it likes; it never widens the shared set.
 */
export function sharedPathsForRun(prompt: string, history?: Array<{ role: string; text: string }>): string[] {
  const userTexts = (history ?? []).filter((m) => m.role === 'user').map((m) => m.text)
  return parseSharedPaths([prompt, ...userTexts.slice(-6)])
}

/**
 * Shared folders for a run from plain text mentions: local paths mentioned as
 * `@/path` (attached files/references). Drive refs and missing paths are
 * skipped; files resolve to their containing dir (reading alongside an
 * attachment is expected).
 */
export function parseSharedPaths(texts: string[]): string[] {
  const out = new Set<string>()
  const mention = /(?:^|\s)@([^\s@]+)/g
  for (const text of texts) {
    if (!text) continue
    for (const m of text.matchAll(mention)) {
      let raw = m[1] ?? ''
      if (raw.startsWith('~/')) raw = path.join(homedir(), raw.slice(2))
      else if (raw === '~') raw = homedir()
      if (!raw.startsWith('/')) continue
      try {
        const st = statSync(raw)
        if (st.isDirectory()) {
          try {
            out.add(realpathSync(raw))
          } catch {
            out.add(raw)
          }
        } else {
          try {
            out.add(path.dirname(realpathSync(raw)))
          } catch {
            out.add(path.dirname(raw))
          }
        }
      } catch {
        // Missing mention — not a shared folder.
      }
    }
  }
  return [...out]
}
