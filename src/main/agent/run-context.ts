import { AsyncLocalStorage } from 'node:async_hooks'
import type { RunSource } from '../../shared/agent.js'

/**
 * Carries the current agent run ({ runId, source }) to tool `execute`
 * functions, whose `(input) => output` signature has no room for context.
 * The runner wraps each run; Composio wrappers read it for BudgetGuard
 * accounting (per-run caps, dedupe, scheduled share). Falls back to an
 * ephemeral palette-scoped context so calls are still metered, never free.
 */

export interface RunContext {
  runId: string
  source: RunSource
  /** AbortSignal of the agent run; long tools must poll it and stop. */
  signal?: AbortSignal
}

const storage = new AsyncLocalStorage<RunContext>()

export function runWithContext<T>(ctx: RunContext, fn: () => T): T {
  return storage.run(ctx, fn)
}

export function getRunContext(): RunContext | undefined {
  return storage.getStore()
}

let fallbackCounter = 0
export function currentOrFallbackContext(): RunContext {
  return (
    getRunContext() ?? {
      runId: `fallback-${Date.now().toString(36)}-${fallbackCounter++}`,
      source: 'palette'
    }
  )
}
