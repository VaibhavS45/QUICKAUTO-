import { AsyncLocalStorage } from 'node:async_hooks'
import type { RunSource } from '../../shared/agent.js'

/** Identifies the agent run a tool execution belongs to (BudgetGuard metering). */
export interface RunContext {
  runId: string
  source: RunSource
  signal?: AbortSignal
}

const storage = new AsyncLocalStorage<RunContext>()

/** Run `fn` with `{ runId, source }` visible to tool execute functions below. */
export function runWithContext<T>(ctx: RunContext, fn: () => T): T {
  return storage.run(ctx, fn)
}

export function getRunContext(): RunContext | undefined {
  return storage.getStore()
}

/** Context of the current run, or a harmless fallback outside any run. */
export function currentOrFallbackContext(): RunContext {
  return storage.getStore() ?? { runId: 'no-run', source: 'palette' }
}
