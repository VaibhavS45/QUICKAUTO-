import { tool } from 'ai'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import { z } from 'zod'
import type { RunSource } from '../../shared/agent.js'

/**
 * Built-in proof tools. `echo` is a read (auto-runs). `echo_write` is a fake
 * WRITE: it must always go through the in-app approve/deny card, so the agent
 * is configured with `toolApproval: { echo_write: 'user-approval' }`.
 *
 * NOTE (ai v7, verified Oct 2026): per-tool `needsApproval` on `tool()` is
 * DEPRECATED — approval policy lives in `toolApproval` on the ToolLoopAgent /
 * generate call. See buildToolApproval().
 */

export const EchoInputSchema = z.object({
  text: z.string().min(1).max(2000)
})

function validateWritePath(filePath: string): string {
  const trimmed = filePath.trim()
  if (!trimmed) return 'Write target path is required.'
  const resolved = path.resolve(trimmed)
  const allowedRoots = [path.resolve(homedir()), path.resolve(process.cwd()), '/tmp']
  const ok = allowedRoots.some((root) => resolved === root || resolved.startsWith(`${root}${path.sep}`))
  if (!ok) {
    return 'Only files inside your home directory, the current workspace, or /tmp may be written.'
  }
  if (resolved.includes('\0')) {
    return 'Invalid file path.'
  }
  return ''
}

export function createBuiltinTools() {
  const echo = tool({
    description: 'Echo back the given text. A harmless read-only test tool.',
    inputSchema: EchoInputSchema,
    execute: async ({ text }) => ({ echo: text })
  })

  const echo_write = tool({
    description:
      'Fake write tool for testing the approval flow. Pretends to write text somewhere. Requires user approval.',
    inputSchema: EchoInputSchema,
    execute: async ({ text }) => ({ written: text })
  })

  const write_file = tool({
    description:
      'Safely write a text payload to a local file, creating parent directories when needed. Use only when the user explicitly asks to save or append data.',
    inputSchema: z.object({
      path: z.string().min(1).max(4096),
      content: z.string().max(200000),
      append: z.boolean().optional(),
      createDirs: z.boolean().optional()
    }),
    execute: async ({ path: filePath, content, append = false, createDirs = true }) => {
      const error = validateWritePath(filePath)
      if (error) throw new Error(error)
      const resolved = path.resolve(filePath)
      const dir = path.dirname(resolved)
      if (createDirs) await mkdir(dir, { recursive: true })
      if (!append) {
        await writeFile(resolved, content, 'utf8')
        return { ok: true, path: resolved, mode: 'write', bytes: Buffer.byteLength(content, 'utf8') }
      }
      let existing = ''
      try {
        existing = await readFile(resolved, 'utf8')
      } catch {
        existing = ''
      }
      const next = `${existing}${content}`
      await writeFile(resolved, next, 'utf8')
      return { ok: true, path: resolved, mode: 'append', bytes: Buffer.byteLength(next, 'utf8') }
    }
  })

  return { echo, echo_write, write_file }
}

/** Tools that need an in-app approve/deny card before they may run. */
export const APPROVAL_REQUIRED_TOOLS: ReadonlySet<string> = new Set([
  'echo_write',
  'write_file',
  'notion_create',
  'gmail_draft',
  'gmail_send',
  'gmail_reply',
  'gmail_modify_labels',
  'github_resolve_conflicts',
  'github_commit_resolution',
  'github_push_resolution'
])

export type ToolApprovalValue = 'user-approval' | 'approved' | { type: 'denied'; reason: string }

/**
 * Build the `toolApproval` map for the agent.
 * - Write tools: 'user-approval' in interactive runs, ALWAYS — the per-tool
 *   auto-approve setting never applies to writes. Scheduled runs deny them
 *   outright (queued for review, never run silently).
 * - Other tools: 'approved' when the user enabled per-tool auto-approve for
 *   interactive runs, otherwise omitted ('not-applicable', runs normally).
 *   Auto-approve is ignored for every scheduled run.
 */
export function buildToolApproval(
  source: RunSource,
  toolNames: string[],
  autoApprove: ReadonlySet<string> = new Set()
): Record<string, ToolApprovalValue> {
  const out: Record<string, ToolApprovalValue> = {}
  for (const name of toolNames) {
    if (APPROVAL_REQUIRED_TOOLS.has(name) || name.startsWith('mcp_')) {
      out[name] =
        source === 'scheduled'
          ? { type: 'denied', reason: 'Scheduled runs cannot auto-approve writes; queued for review.' }
          : 'user-approval'
      continue
    }
    if ((source === 'palette' || source === 'chat') && autoApprove.has(name)) {
      out[name] = 'approved'
    }
  }
  return out
}
