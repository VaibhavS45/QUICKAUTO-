/**
 * BudgetGuard — wraps every Composio tool execution with a conservative local meter.
 *
 * Docs verified Oct 2026 (Composio pricing + updated-pricing pages):
 * - Each tool execution counts once.
 * - Meta tools (tool search, multi-execute wrapper itself) are FREE.
 * - FAILED calls do NOT count.
 *
 * This meter deliberately counts EVERY attempted call (including meta + failed)
 * so small counting differences can never push anyone over the 20K
 * Composio-managed shared-app cap. Soft budget defaults to 15,000/month and is
 * hard-clamped to never exceed 19,000. Scheduled runs are limited to 60% of it.
 */

export type RunSource = 'palette' | 'scheduled'

export interface BudgetUsageState {
  /** "YYYY-MM" bucket for the current period, given the reset day. */
  periodKey: string
  /** All attempted calls in this period (conservative: includes cached-read misses only). */
  used: number
  /** Attempted calls from source === 'scheduled' in this period. */
  scheduledUsed: number
}

export interface BudgetStore {
  load(): BudgetUsageState | null
  save(state: BudgetUsageState): void
}

export class MemoryBudgetStore implements BudgetStore {
  private state: BudgetUsageState | null = null
  load(): BudgetUsageState | null {
    return this.state
  }
  save(state: BudgetUsageState): void {
    this.state = { ...state }
  }
}

export interface BudgetGuardOptions {
  store?: BudgetStore
  /** Day-of-month the period rolls over (1-28). Default 1. */
  resetDay?: number
  /** Soft monthly budget. Clamped to max 19_000. Default 15_000. */
  softBudget?: number
  /** Max tool calls the agent may request for one user request. Default 8. */
  perRequestCap?: number
  /** Max tool calls executed within a single run. Default 15. */
  perRunCap?: number
  /** Fraction of the budget reserved-cap for scheduled runs. Default 0.6. */
  scheduledShare?: number
  /** Cache TTL for read results, ms. Default 5 min. */
  readCacheTtlMs?: number
  /** Clock, for tests. Default Date.now. */
  now?: () => number
}

export interface CacheEntry {
  value: unknown
  expiresAt: number
}

export interface PreflightResult {
  ok: boolean
  /** Machine-readable reason when refused. */
  reason?: string
  /** Human message for the palette. */
  message?: string
  warning?: 'none' | 'warn70' | 'warn90' | 'exceeded'
}

const MAX_BUDGET = 19_000
const DEFAULT_BUDGET = 15_000

export function periodKeyFor(date: Date, resetDay: number): string {
  const day = Math.min(Math.max(1, Math.floor(resetDay)), 28)
  // Period starts on resetDay: dates before it belong to the previous month.
  const d = date.getDate() < day ? new Date(date.getFullYear(), date.getMonth() - 1, 1) : date
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function isNetworkError(err: unknown): boolean {
  const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
  return /ECONN|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|fetch failed|network|socket hang up|TLS|timeout/i.test(msg)
}

export class BudgetGuard {
  readonly resetDay: number
  readonly softBudget: number
  readonly perRequestCap: number
  readonly perRunCap: number
  readonly scheduledShare: number
  readonly readCacheTtlMs: number

  private readonly store: BudgetStore
  private readonly now: () => number
  private cache = new Map<string, CacheEntry>()
  /** First results seen within each run, for dedupe: runId -> key -> result. */
  private runSeen = new Map<string, Map<string, unknown>>()
  /** Calls executed within each run: runId -> count. */
  private runCalls = new Map<string, number>()

  constructor(opts: BudgetGuardOptions = {}) {
    this.resetDay = Math.min(Math.max(1, Math.floor(opts.resetDay ?? 1)), 28)
    this.softBudget = Math.min(opts.softBudget ?? DEFAULT_BUDGET, MAX_BUDGET)
    this.perRequestCap = opts.perRequestCap ?? 8
    this.perRunCap = opts.perRunCap ?? 15
    this.scheduledShare = opts.scheduledShare ?? 0.6
    this.readCacheTtlMs = opts.readCacheTtlMs ?? 5 * 60 * 1000
    this.store = opts.store ?? new MemoryBudgetStore()
    this.now = opts.now ?? Date.now
  }

  private currentState(): BudgetUsageState {
    const key = periodKeyFor(new Date(this.now()), this.resetDay)
    const stored = this.store.load()
    if (!stored || stored.periodKey !== key) {
      const fresh: BudgetUsageState = { periodKey: key, used: 0, scheduledUsed: 0 }
      this.store.save(fresh)
      return fresh
    }
    return stored
  }

  /** Current meter snapshot (rolls the period over when stale). */
  status(): BudgetUsageState & {
    budget: number
    scheduledBudget: number
    scheduledUsed: number
    remaining: number
    warning: 'none' | 'warn70' | 'warn90' | 'exceeded'
    usageRatio: number
  } {
    const s = this.currentState()
    const budget = this.softBudget
    const ratio = budget <= 0 ? 1 : s.used / budget
    const warning = ratio >= 1 ? 'exceeded' : ratio >= 0.9 ? 'warn90' : ratio >= 0.7 ? 'warn70' : 'none'
    return {
      ...s,
      budget,
      scheduledBudget: Math.floor(budget * this.scheduledShare),
      remaining: Math.max(0, budget - s.used),
      warning,
      usageRatio: ratio
    }
  }

  /**
   * Pre-flight check before a user request starts: refuses when the meter is
   * exhausted or the request asks for more calls than allowed.
   */
  preflight(source: RunSource, estimatedCalls: number): PreflightResult {
    const st = this.status()
    if (st.used >= st.budget) {
      return {
        ok: false,
        reason: 'budget-exhausted',
        warning: 'exceeded',
        message:
          `Composio monthly budget exhausted (${st.used}/${st.budget}). ` +
          `No further tool calls this period. See the Composio dashboard usage page as source of truth.`
      }
    }
    if (estimatedCalls > this.perRequestCap) {
      return {
        ok: false,
        reason: 'per-request-cap',
        warning: st.warning,
        message: `Request asks for ~${estimatedCalls} tool calls, above the per-request cap of ${this.perRequestCap}. Narrow the request.`
      }
    }
    if (source === 'scheduled' && st.scheduledUsed >= st.scheduledBudget) {
      return {
        ok: false,
        reason: 'scheduled-share-exhausted',
        warning: st.warning,
        message:
          `Scheduled-run share exhausted (${st.scheduledUsed}/${st.scheduledBudget}). ` +
          `Scheduled runs are limited to 60% of the ${st.budget} budget.`
      }
    }
    return { ok: true, warning: st.warning }
  }

  /**
   * Execute `fn` under budget accounting.
   *
   * - `cacheKey` (reads only): cache hits cost ZERO and skip `fn`.
   * - identical `dedupeKey` within the same `runId`: skipped, costs ZERO.
   * - every other attempt counts once locally (conservative: even failures,
   *   even though Composio does not bill failures).
   * - retries: at most ONE retry, only on network errors.
   */
  async execute<T>(opts: {
    source: RunSource
    runId: string
    label: string
    fn: () => Promise<T>
    cacheKey?: string
    dedupeKey?: string
    isRetryableNetworkError?: (err: unknown) => boolean
  }): Promise<{ result: T; cached: boolean; deduped: boolean }> {
    const { source, runId, fn } = opts
    const cacheKey = opts.cacheKey
    const dedupeKey = opts.dedupeKey ?? opts.label
    const retryable = opts.isRetryableNetworkError ?? isNetworkError

    // 1. Cache (reads): hits cost zero.
    if (cacheKey) {
      const hit = this.cache.get(cacheKey)
      if (hit && hit.expiresAt > this.now()) {
        return { result: hit.value as T, cached: true, deduped: false }
      }
      if (hit) this.cache.delete(cacheKey)
    }

    // 2. Dedupe within one run: identical calls return the first result, cost ZERO.
    let seen = this.runSeen.get(runId)
    if (!seen) {
      seen = new Map()
      this.runSeen.set(runId, seen)
    }
    if (seen.has(dedupeKey)) {
      return { result: seen.get(dedupeKey) as T, cached: false, deduped: true }
    }

    // 3. Per-run cap.
    const usedInRun = this.runCalls.get(runId) ?? 0
    if (usedInRun >= this.perRunCap) {
      throw new Error(`Per-run cap reached (${this.perRunCap} tool calls in run ${runId}).`)
    }

    // 4. Budget pre-flight (single call).
    const pre = this.preflight(source, 1)
    if (!pre.ok) throw new Error(pre.message ?? 'Budget preflight refused.')

    // 5. Execute with at most one retry on network errors only.
    let attempt = 0
    for (;;) {
      try {
        const result = await fn()
        this.recordCall(source, runId)
        seen.set(dedupeKey, result)
        if (cacheKey) this.cache.set(cacheKey, { value: result, expiresAt: this.now() + this.readCacheTtlMs })
        return { result, cached: false, deduped: false }
      } catch (err) {
        if (attempt === 0 && retryable(err)) {
          attempt++
          continue
        }
        // Conservative meter: failed attempts still count locally.
        this.recordCall(source, runId)
        throw err
      }
    }
  }

  private recordCall(source: RunSource, runId: string): void {
    const st = this.currentState()
    st.used += 1
    if (source === 'scheduled') st.scheduledUsed += 1
    this.store.save(st)
    this.runCalls.set(runId, (this.runCalls.get(runId) ?? 0) + 1)
  }

  /** Forget per-run dedupe/counters (call when a run finishes). */
  endRun(runId: string): void {
    this.runSeen.delete(runId)
    this.runCalls.delete(runId)
  }

  /** For tests/debug: cache size. */
  cacheSize(): number {
    return this.cache.size
  }

  clearCache(): void {
    this.cache.clear()
  }
}
