import { describe, expect, it, vi } from 'vitest'
import {
  BudgetGuard,
  MemoryBudgetStore,
  periodKeyFor
} from '../../src/main/connectors/budget-guard.js'

function guardWith(opts: { at?: number; resetDay?: number; softBudget?: number } = {}) {
  let t = opts.at ?? new Date(2026, 9, 7, 12, 0, 0).getTime()
  const now = () => t
  const advance = (ms: number) => {
    t += ms
  }
  const { at: _at, ...rest } = opts
  void _at
  const g = new BudgetGuard({ store: new MemoryBudgetStore(), now, ...rest })
  return { g, now, advance }
}

describe('BudgetGuard caps', () => {
  it('counts every attempted call and refuses at 100%', async () => {
    const { g } = guardWith({ softBudget: 3 })
    await g.execute({ source: 'palette', runId: 'r1', label: 'a', fn: async () => 'ok' })
    await g.execute({ source: 'palette', runId: 'r1', label: 'b', fn: async () => 'ok' })
    await g.execute({ source: 'palette', runId: 'r1', label: 'c', fn: async () => 'ok' })
    expect(g.status().used).toBe(3)
    await expect(
      g.execute({ source: 'palette', runId: 'r2', label: 'd', fn: async () => 'ok' })
    ).rejects.toThrow(/budget exhausted/i)
  })

  it('never allows a soft budget above 19,000', () => {
    const { g } = guardWith({ softBudget: 60_000 })
    expect(g.softBudget).toBe(19_000)
  })

  it('warns at 70% and 90%', async () => {
    const { g } = guardWith({ softBudget: 10 })
    for (let i = 0; i < 7; i++) {
      await g.execute({ source: 'palette', runId: `r${i}`, label: `c${i}`, fn: async () => 1 })
    }
    expect(g.status().warning).toBe('warn70')
    await g.execute({ source: 'palette', runId: 'r8', label: 'c8', fn: async () => 1 })
    await g.execute({ source: 'palette', runId: 'r9', label: 'c9', fn: async () => 1 })
    expect(g.status().warning).toBe('warn90')
  })

  it('enforces the per-request cap in preflight', () => {
    const { g } = guardWith()
    expect(g.preflight('palette', 8).ok).toBe(true)
    const over = g.preflight('palette', 9)
    expect(over.ok).toBe(false)
    expect(over.reason).toBe('per-request-cap')
  })

  it('enforces the per-run cap', async () => {
    const inner = new BudgetGuard({
      store: new MemoryBudgetStore(),
      perRunCap: 2,
      softBudget: 1000
    })
    await inner.execute({ source: 'palette', runId: 'r', label: 'a', fn: async () => 1 })
    await inner.execute({ source: 'palette', runId: 'r', label: 'b', fn: async () => 1 })
    await expect(inner.execute({ source: 'palette', runId: 'r', label: 'c', fn: async () => 1 })).rejects.toThrow(
      /per-run cap/i
    )
  })
})

describe('BudgetGuard scheduled share', () => {
  it('limits scheduled runs to 60% of budget', async () => {
    const { g } = guardWith({ softBudget: 10 })
    for (let i = 0; i < 6; i++) {
      await g.execute({ source: 'scheduled', runId: `s${i}`, label: `c${i}`, fn: async () => 1 })
    }
    const pre = g.preflight('scheduled', 1)
    expect(pre.ok).toBe(false)
    expect(pre.reason).toBe('scheduled-share-exhausted')
    // Interactive calls still allowed.
    expect(g.preflight('palette', 1).ok).toBe(true)
  })
})

describe('BudgetGuard period reset', () => {
  it('rolls over on the reset day', async () => {
    const start = new Date(2026, 8, 30, 12, 0, 0).getTime() // Sep 30
    const { g, advance } = guardWith({ at: start, resetDay: 1 })
    await g.execute({ source: 'palette', runId: 'r1', label: 'a', fn: async () => 1 })
    expect(g.status().used).toBe(1)
    advance(2 * 24 * 3600 * 1000) // Oct 2 -> new period
    expect(g.status().used).toBe(0)
    expect(g.status().periodKey).toBe('2026-10')
  })

  it('dates before reset day belong to the previous month', () => {
    expect(periodKeyFor(new Date(2026, 9, 5), 15)).toBe('2026-09')
    expect(periodKeyFor(new Date(2026, 9, 20), 15)).toBe('2026-10')
  })
})

describe('BudgetGuard cache + dedupe', () => {
  it('cache hits cost zero', async () => {
    const { g } = guardWith()
    const fn = vi.fn(async () => ({ mails: [1, 2] }))
    const first = await g.execute({
      source: 'palette',
      runId: 'r1',
      label: 'list',
      cacheKey: 'gmail:list:q',
      dedupeKey: 'gmail:list:q',
      fn
    })
    expect(first.cached).toBe(false)
    const second = await g.execute({
      source: 'palette',
      runId: 'r2',
      label: 'list',
      cacheKey: 'gmail:list:q',
      dedupeKey: 'gmail:list:q',
      fn
    })
    expect(second.cached).toBe(true)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(g.status().used).toBe(1)
  })

  it('cache expires after TTL', async () => {
    const { g, advance } = guardWith()
    const fn = vi.fn(async () => 'v')
    await g.execute({ source: 'palette', runId: 'r1', label: 'x', cacheKey: 'k', fn })
    advance(5 * 60 * 1000 + 1)
    // New run: past TTL so the cached value is gone and fn runs again.
    const again = await g.execute({ source: 'palette', runId: 'r2', label: 'x', cacheKey: 'k', fn })
    expect(again.cached).toBe(false)
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('dedupes identical calls within one run', async () => {
    const { g } = guardWith()
    const fn = vi.fn(async () => 'res')
    const a = await g.execute({ source: 'palette', runId: 'r1', label: 'send', dedupeKey: 'same', fn })
    const b = await g.execute({ source: 'palette', runId: 'r1', label: 'send', dedupeKey: 'same', fn })
    expect(a.deduped).toBe(false)
    expect(b.deduped).toBe(true)
    expect(b.result).toBe('res')
    expect(fn).toHaveBeenCalledTimes(1)
    expect(g.status().used).toBe(1)
  })

  it('same call in different runs counts again', async () => {
    const { g } = guardWith()
    const fn = vi.fn(async () => 'res')
    await g.execute({ source: 'palette', runId: 'r1', label: 'x', dedupeKey: 'same', fn })
    await g.execute({ source: 'palette', runId: 'r2', label: 'x', dedupeKey: 'same', fn })
    expect(fn).toHaveBeenCalledTimes(2)
    expect(g.status().used).toBe(2)
  })
})

describe('BudgetGuard retry policy', () => {
  it('retries once on network errors only', async () => {
    const { g } = guardWith()
    let n = 0
    const flaky = async () => {
      n++
      if (n === 1) throw new Error('fetch failed: ECONNRESET')
      return 'ok'
    }
    const out = await g.execute({ source: 'palette', runId: 'r1', label: 'net', dedupeKey: 'net1', fn: flaky })
    expect(out.result).toBe('ok')
    expect(n).toBe(2)
    // One logical call counted once.
    expect(g.status().used).toBe(1)
  })

  it('does not retry app errors, but still counts the failed attempt', async () => {
    const { g } = guardWith()
    let n = 0
    await expect(
      g.execute({
        source: 'palette',
        runId: 'r1',
        label: 'app',
        dedupeKey: 'app1',
        fn: async () => {
          n++
          throw new Error('400 invalid argument')
        }
      })
    ).rejects.toThrow(/invalid argument/)
    expect(n).toBe(1)
    expect(g.status().used).toBe(1)
  })

  it('gives up after the second network failure', async () => {
    const { g } = guardWith()
    let n = 0
    await expect(
      g.execute({
        source: 'palette',
        runId: 'r1',
        label: 'net',
        dedupeKey: 'net2',
        fn: async () => {
          n++
          throw new Error('socket hang up')
        }
      })
    ).rejects.toThrow(/socket hang up/)
    expect(n).toBe(2)
  })
})
