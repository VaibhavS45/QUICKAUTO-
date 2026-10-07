import { describe, expect, it, vi } from 'vitest'
import { AwakeManager, MemoryAwakeStore, type AwakePlatform } from '../../src/main/agent/awake.js'

function setup(over: Partial<{ enabled: boolean; onBattery: boolean }> = {}): {
  mgr: AwakeManager
  platform: AwakePlatform & { started: number; stopped: number[]; emitPower(): void; setBattery(v: boolean): void }
} {
  const store = new MemoryAwakeStore(over.enabled ?? true)
  let onBattery = over.onBattery ?? false
  let nextId = 1
  let powerCb: (() => void) | null = null
  const platform = {
    started: 0,
    stopped: [] as number[],
    startBlocker: vi.fn((): number => {
      platform.started += 1
      return nextId++
    }),
    stopBlocker: vi.fn((id: number): void => {
      platform.stopped.push(id)
    }),
    isOnBattery: () => onBattery,
    onPowerChange: (cb: () => void): (() => void) => {
      powerCb = cb
      return () => {
        powerCb = null
      }
    },
    emitPower: (): void => powerCb?.(),
    setBattery: (v: boolean): void => {
      onBattery = v
    }
  } as AwakePlatform & { started: number; stopped: number[]; emitPower(): void; setBattery(v: boolean): void }
  const mgr = new AwakeManager(store, platform)
  return { mgr, platform }
}

describe('AwakeManager', () => {
  it('holds a blocker when enabled and on AC', () => {
    const { mgr } = setup()
    mgr.reconcile()
    expect(mgr.holding).toBe(true)
  })

  it('reconcile is idempotent (no duplicate blockers)', () => {
    const { mgr, platform } = setup()
    mgr.reconcile()
    mgr.reconcile()
    expect(platform.started).toBe(1)
    expect(mgr.holding).toBe(true)
  })

  it('setEnabled(false) persists and releases the blocker', () => {
    const { mgr, platform } = setup()
    mgr.reconcile()
    expect(mgr.setEnabled(false)).toBe(false)
    expect(mgr.holding).toBe(false)
    expect(platform.stopped).toHaveLength(1)
    expect(mgr.enabled).toBe(false)
  })

  it('re-enabling re-acquires the blocker', () => {
    const { mgr, platform } = setup({ enabled: false })
    mgr.reconcile()
    expect(mgr.holding).toBe(false)
    mgr.setEnabled(true)
    expect(mgr.holding).toBe(true)
    expect(platform.started).toBe(1)
  })

  it('pauses on battery, resumes on AC via power events', () => {
    const { mgr, platform } = setup()
    const off = mgr.attach()
    mgr.reconcile()
    expect(mgr.holding).toBe(true)
    platform.setBattery(true)
    platform.emitPower()
    expect(mgr.holding).toBe(false)
    platform.setBattery(false)
    platform.emitPower()
    expect(mgr.holding).toBe(true)
    off()
  })

  it('never holds while pref is off, even on power flips', () => {
    const { mgr, platform } = setup({ enabled: false })
    mgr.attach()
    mgr.reconcile()
    platform.emitPower()
    expect(mgr.holding).toBe(false)
    expect(platform.started).toBe(0)
  })

  it('survives platform throws without crashing', () => {
    const store = new MemoryAwakeStore(true)
    const bad: AwakePlatform = {
      startBlocker: () => {
        throw new Error('no blocker')
      },
      stopBlocker: () => {
        throw new Error('gone')
      },
      isOnBattery: () => {
        throw new Error('unknown')
      },
      onPowerChange: () => () => {}
    }
    const mgr = new AwakeManager(store, bad)
    expect(() => mgr.reconcile()).not.toThrow()
    expect(mgr.holding).toBe(false)
  })
})
