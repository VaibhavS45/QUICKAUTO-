import { tool } from 'ai'
import { z } from 'zod'

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

  return { echo, echo_write }
}

export type BuiltinToolName = keyof ReturnType<typeof createBuiltinTools>

/** Tools that need an in-app approve/deny card before they may run. */
export const APPROVAL_REQUIRED_TOOLS: ReadonlySet<string> = new Set(['echo_write'])

/**
 * Build the `toolApproval` map for the agent. Write tools get 'user-approval';
 * scheduled runs deny them outright (writes are queued for review, never run
 * silently). Everything else is 'not-applicable' (runs normally).
 */
export function buildToolApproval(
  source: 'palette' | 'scheduled',
  toolNames: string[]
): Record<string, 'user-approval' | { type: 'denied'; reason: string }> {
  const out: Record<string, 'user-approval' | { type: 'denied'; reason: string }> = {}
  for (const name of toolNames) {
    if (!APPROVAL_REQUIRED_TOOLS.has(name)) continue
    out[name] =
      source === 'scheduled'
        ? { type: 'denied', reason: 'Scheduled runs cannot auto-approve writes; queued for review.' }
        : 'user-approval'
  }
  return out
}
