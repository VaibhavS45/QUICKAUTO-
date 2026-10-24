import { describe, expect, it } from 'vitest'
import { coordinateQuit } from '../../src/main/shell/quit-coordinator.js'

interface FakeRun {
  abort: () => void
  aborted: boolean
}

function runs(count: number): FakeRun[] {
  return Array.from({ length: count }, (): FakeRun => ({
    aborted: false,
    abort() {
      this.aborted = true
    }
  }))
}

describe('coordinateQuit (W7 shutdown)', () => {
  it('aborts every live run synchronously before cleanup starts', async () => {
    const local = runs(3)
    let stopCalls = 0
    const promise = coordinateQuit({
      runs: local,
      stops: [async () => {
        // By the time cleanup runs, every run must already be aborted.
        expect(local.every((r) => r.aborted)).toBe(true)
        stopCalls += 1
      }],
      timeoutMs: 200
    })
    await expect(promise).resolves.toBe('done')
    expect(local.every((r) => r.aborted)).toBe(true)
    expect(stopCalls).toBe(1)
  })

  it('collects every stop result even when one fails or hangs (bounded)', async () => {
    const calls: string[] = []
    const promise = coordinateQuit({
      runs: [],
      stops: [
        async () => {
          calls.push('fast')
        },
        async () => {
          throw new Error('stop failed')
        },
        () => new Promise(() => {}) // hangs; must not block below the timeout
      ],
      timeoutMs: 100
    })
    await expect(promise).resolves.toBe('timeout')
    expect(calls).toEqual(['fast'])
  })

  it('reports done when all stops settle inside the bound', async () => {
    const promise = coordinateQuit({
      runs: [],
      stops: [async () => undefined, async () => undefined],
      timeoutMs: 200
    })
    await expect(promise).resolves.toBe('done')
  })
})
