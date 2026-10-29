import { describe, expect, it, vi } from 'vitest'
import { AuthChannels, registerAuthIpc, type AuthPort } from '../../src/main/auth/auth-ipc.js'
import type { AuthState } from '../../src/shared/contracts/auth.js'

type Handler = (_event: unknown, payload?: unknown) => unknown

const signedOut: AuthState = { signedIn: false, configured: true, method: 'local', hasAccounts: true }
const signedIn: AuthState = { signedIn: true, configured: true, method: 'local', hasAccounts: true, name: 'alice' }

function setup(): { handlers: Map<string, Handler>; auth: AuthPort } {
  const handlers = new Map<string, Handler>()
  const auth: AuthPort = {
    getState: vi.fn(() => signedOut),
    login: vi.fn(async () => signedIn),
    register: vi.fn(async () => signedIn),
    reset: vi.fn(async () => signedIn),
    logout: vi.fn(async () => signedOut)
  }
  registerAuthIpc({
    handle: (channel, listener) => {
      handlers.set(channel, listener as Handler)
    }
  }, auth)
  return { handlers, auth }
}

describe('auth IPC', () => {
  it('returns the non-secret account state', async () => {
    const { handlers } = setup()
    await expect(handlers.get(AuthChannels.getState)!({})).resolves.toEqual({ ok: true, state: signedOut })
  })

  it('validates credentials before calling the account service', async () => {
    const { handlers, auth } = setup()
    const login = handlers.get(AuthChannels.login)!
    await expect(login({}, { username: 'alice', password: 'secret-password' }))
      .resolves.toEqual({ ok: true, state: signedIn })
    expect(auth.login).toHaveBeenCalledWith({ username: 'alice', password: 'secret-password' })

    await expect(login({}, { username: 'alice', password: 'short' }))
      .resolves.toEqual({ ok: false, error: 'Password must be at least 8 characters.' })
    expect(auth.login).toHaveBeenCalledTimes(1)
  })

  it('keeps the legacy sign-in channel closed to credential-less calls', async () => {
    const { handlers, auth } = setup()
    await expect(handlers.get(AuthChannels.signIn)!({})).resolves.toEqual({
      ok: false,
      error: 'Enter your username and password to sign in.'
    })
    expect(auth.login).not.toHaveBeenCalled()
  })

  it('logs out through the sign-out channel', async () => {
    const { handlers, auth } = setup()
    await expect(handlers.get(AuthChannels.signOut)!({})).resolves.toEqual({ ok: true, state: signedOut })
    expect(auth.logout).toHaveBeenCalledTimes(1)
  })

  it('routes password resets through username + recovery key validation', async () => {    const { handlers, auth } = setup()
    const reset = handlers.get(AuthChannels.reset)!

    await expect(reset({}, {
      username: 'alice',
      recoveryKey: 'AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-0000-1111',
      password: 'new-password'
    })).resolves.toEqual({ ok: true, state: signedIn })
    expect(auth.reset).toHaveBeenCalledWith({
      username: 'alice',
      recoveryKey: 'AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-0000-1111',
      password: 'new-password'
    })

    await expect(reset({}, { username: 'alice', recoveryKey: '   ', password: 'new-password' }))
      .resolves.toEqual({ ok: false, error: 'Enter your recovery key.' })

    await expect(reset({}, { username: 'alice', recoveryKey: 'A'.repeat(65), password: 'new-password' }))
      .resolves.toEqual({ ok: false, error: 'Recovery keys are 32 characters.' })
    expect(auth.reset).toHaveBeenCalledTimes(1)
  })

  it('passes the one-time recovery key from registration through untouched', async () => {
    const handlers = new Map<string, Handler>()
    const keyed = { ...signedIn, recoveryKey: 'AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-0000-1111' }
    const auth: AuthPort = {
      getState: () => signedOut,
      login: vi.fn(async () => signedIn),
      register: vi.fn(async () => keyed as AuthState),
      reset: vi.fn(async () => signedIn),
      logout: vi.fn(async () => signedOut)
    }
    registerAuthIpc(
      { handle: (channel, listener) => handlers.set(channel, listener as Handler) },
      auth
    )
    await expect(handlers.get(AuthChannels.register)!({}, { username: 'alice', password: 'secret-password' }))
      .resolves.toEqual({ ok: true, state: keyed })
  })
})
