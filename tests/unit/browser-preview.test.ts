import { afterEach, describe, expect, it, vi } from 'vitest'

type FakeWindow = { app: unknown; location: { hash: string } }

async function load(fake: FakeWindow): Promise<void> {
  vi.stubGlobal('window', fake)
  vi.resetModules()
  await import('../../src/renderer/browser-preview.js')
}

describe('browser preview stub', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('fills in mock data when no preload provided window.app', async () => {
    const fake: FakeWindow = { app: undefined, location: { hash: '' } }
    await load(fake)
    const api = fake.app as Record<string, (...args: unknown[]) => unknown>

    await expect(api.chatList()).resolves.toEqual({ ok: true, threads: [] })
    await expect(api.notificationsList()).resolves.toEqual({ ok: true, notifications: [] })
    await expect(api.getAppBehavior()).resolves.toMatchObject({ ok: true, theme: 'dark' })
    // Unknown methods fail loudly instead of hanging or resolving to undefined.
    await expect(api.driveStatus()).resolves.toMatchObject({ ok: false })
    // Subscriptions must return an unsubscribe function, not a promise.
    expect(typeof api.onAgentEvent(() => {})).toBe('function')
    expect(typeof (api.onAgentEvent(() => {}) as () => void)()).toBe('undefined')
    // Window controls fall through to hash routing.
    api.openSettingsWindow('connectors')
    expect(fake.location.hash).toBe('#settings?tab=connectors')
    api.closeSettings()
    expect(fake.location.hash).toBe('#app')
  })

  it('never replaces the real preload API', async () => {
    const real = (): Promise<{ ok: true }> => Promise.resolve({ ok: true })
    const fake: FakeWindow = { app: { chatList: real }, location: { hash: '' } }
    await load(fake)
    expect((fake.app as { chatList: unknown }).chatList).toBe(real)
  })
})