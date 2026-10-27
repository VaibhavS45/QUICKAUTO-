import { describe, expect, it, vi } from 'vitest'
import {
  InstallIdentityService,
  isValidInstallId,
  type InstallIdentityStore
} from '../../src/main/settings/install-identity.js'

class MemoryStore implements InstallIdentityStore {
  private readonly data = new Map<string, unknown>()
  get(key: string): unknown {
    return this.data.get(key)
  }
  set(key: string, value: unknown): void {
    this.data.set(key, value)
  }
}

describe('InstallIdentityService', () => {
  it('generates and persists one random id per install', () => {
    const store = new MemoryStore()
    const service = new InstallIdentityService(store)
    const first = service.getInstallId()
    expect(isValidInstallId(first)).toBe(true)
    expect(service.getInstallId()).toBe(first)
    expect(new InstallIdentityService(store).getInstallId()).toBe(first)
  })

  it('keeps a valid existing id without generating another', () => {
    const store = new MemoryStore()
    store.set('install-id', 'palette-11111111-1111-4111-8111-111111111111')
    const makeId = vi.fn()
    const service = new InstallIdentityService(store, makeId)
    expect(service.getInstallId()).toBe('palette-11111111-1111-4111-8111-111111111111')
    expect(makeId).not.toHaveBeenCalled()
  })

  it('replaces malformed ids and rejects malformed generated ids', () => {
    const store = new MemoryStore()
    store.set('install-id', 'legacy-shared-user')
    const service = new InstallIdentityService(store, () => 'palette-22222222-2222-4222-8222-222222222222')
    expect(service.getInstallId()).toBe('palette-22222222-2222-4222-8222-222222222222')
    expect(store.get('install-id')).toBe('palette-22222222-2222-4222-8222-222222222222')

    expect(() => new InstallIdentityService(new MemoryStore(), () => 'not-an-id').getInstallId()).toThrow(
      /invalid/i
    )
  })
})
