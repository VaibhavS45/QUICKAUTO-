import { describe, expect, it } from 'vitest'
import { AuthService, type AuthDeps, type KeyValueStore, type OAuthPort, type TokenVault } from '../../src/main/auth/auth-service.js'
import { OAuthError } from '../../src/main/auth/auth-errors.js'
import type { LoopbackHandle } from '../../src/main/auth/loopback.js'
import type { OAuthConfig, Tokens } from '../../src/main/auth/oidc-client.js'

const config: OAuthConfig = {
  clientId: 'cid', authUrl: 'https://idp.test/authorize', tokenUrl: 'https://idp.test/token',
  userInfoUrl: 'https://idp.test/userinfo', scopes: 'openid profile email'
}

function memoryVault(): TokenVault & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    get: async (k) => data.get(k) ?? null,
    set: async (k, v) => { data.set(k, v) },
    delete: async (k) => { data.delete(k) }
  }
}

function memoryStore(): KeyValueStore & { data: Map<string, unknown> } {
  const data = new Map<string, unknown>()
  return { data, get: (k) => data.get(k), set: (k, v) => { data.set(k, v) } }
}

function fakeLoopback(outcome: { code?: string; error?: string }): LoopbackHandle & { closed: number } {
  let closed = 0
  return {
    redirectUri: 'http://127.0.0.1:5555/callback',
    result: outcome.error ? Promise.reject(new Error(outcome.error)) : Promise.resolve({ code: outcome.code ?? 'code' }),
    close() { closed++ },
    get closed() { return closed }
  } as LoopbackHandle & { closed: number }
}

function setup(over: Partial<AuthDeps> & { client?: Partial<OAuthPort>; loopback?: ReturnType<typeof fakeLoopback> } = {}) {
  const vault = memoryVault()
  const identityStore = memoryStore()
  const opened: string[] = []
  const loopback = over.loopback ?? fakeLoopback({})
  const client: OAuthPort = {
    exchangeCode: async () => ({ accessToken: 'at', refreshToken: 'rt', expiresAt: Date.now() + 3_600_000 }),
    refresh: async () => ({ accessToken: 'at2', refreshToken: 'rt' }),
    userInfo: async () => ({ name: 'Ada Lovelace', email: 'ada@example.test' }),
    ...over.client
  }
  const deps: AuthDeps = {
    config,
    vault,
    identityStore,
    canEncrypt: async () => true,
    openExternal: async (url) => { opened.push(url) },
    createClient: () => client,
    startLoopback: async () => loopback,
    ...over
  }
  return { auth: new AuthService(deps), vault, identityStore, opened, loopback }
}

describe('AuthService.signIn', () => {
  it('signs in, stores tokens only in the vault, and exposes just the profile', async () => {
    const { auth, vault, identityStore, opened, loopback } = setup()
    const seen: boolean[] = []
    auth.onChange((s) => seen.push(s.signedIn))
    const state = await auth.signIn()
    expect(state).toEqual({ signedIn: true, configured: true, name: 'Ada Lovelace', email: 'ada@example.test' })
    expect(JSON.stringify(state)).not.toContain('at')
    expect(vault.data.get('auth:tokens')).toContain('"accessToken":"at"')
    expect(JSON.stringify(identityStore.data.get('auth-identity'))).not.toContain('accessToken')
    expect(opened[0]).toContain('code_challenge_method=S256')
    expect(opened[0]).toContain('redirect_uri=http%3A%2F%2F127.0.0.1%3A5555%2Fcallback')
    expect(seen).toEqual([true])
    expect(loopback.closed).toBeGreaterThan(0)
  })

  it('refuses when no provider is configured', async () => {
    const { auth } = setup({ config: null })
    expect(auth.getState().configured).toBe(false)
    await expect(auth.signIn()).rejects.toThrow('not configured')
  })

  it('refuses when secure storage is unavailable and stores nothing', async () => {
    const { auth, vault } = setup({ canEncrypt: async () => false })
    await expect(auth.signIn()).rejects.toThrow('Secure storage')
    expect(vault.data.size).toBe(0)
  })

  it('stays signed out when the browser flow fails, and closes the listener', async () => {
    const loopback = fakeLoopback({ error: 'Sign-in failed: access_denied.' })
    const { auth, vault } = setup({ loopback })
    await expect(auth.signIn()).rejects.toThrow('access_denied')
    expect(auth.getState().signedIn).toBe(false)
    expect(vault.data.size).toBe(0)
    expect(loopback.closed).toBeGreaterThan(0)
  })

  it('shares one in-flight sign-in between double clicks', async () => {
    const { auth } = setup()
    const a = auth.signIn()
    const b = auth.signIn()
    expect(a).toBe(b)
    await a
  })
})

describe('AuthService.signOut', () => {
  it('clears tokens and identity', async () => {
    const { auth, vault, identityStore } = setup()
    await auth.signIn()
    const state = await auth.signOut()
    expect(state.signedIn).toBe(false)
    expect(vault.data.size).toBe(0)
    expect(identityStore.data.get('auth-identity')).toBe(null)
  })
})

describe('AuthService.restore', () => {
  const save = async (vault: TokenVault, store: KeyValueStore, tokens: Tokens | string): Promise<void> => {
    await vault.set('auth:tokens', typeof tokens === 'string' ? tokens : JSON.stringify(tokens))
    store.set('auth-identity', { name: 'Ada', email: 'ada@example.test' })
  }

  it('stays signed out with nothing saved', async () => {
    const { auth } = setup()
    expect((await auth.restore()).signedIn).toBe(false)
  })

  it('restores a valid session from the cached identity', async () => {
    const { auth, vault, identityStore } = setup()
    await save(vault, identityStore, { accessToken: 'a', expiresAt: Date.now() + 3_600_000 })
    expect(await auth.restore()).toMatchObject({ signedIn: true, name: 'Ada' })
  })

  it('refreshes an expired token', async () => {
    const { auth, vault, identityStore } = setup()
    await save(vault, identityStore, { accessToken: 'old', refreshToken: 'rt', expiresAt: 1 })
    expect((await auth.restore()).signedIn).toBe(true)
    expect(vault.data.get('auth:tokens')).toContain('at2')
  })

  it('signs out when the provider rejects the refresh', async () => {
    const { auth, vault, identityStore } = setup({
      client: { refresh: async () => { throw new OAuthError('no', 'rejected') } }
    })
    await save(vault, identityStore, { accessToken: 'old', refreshToken: 'rt', expiresAt: 1 })
    expect((await auth.restore()).signedIn).toBe(false)
    expect(vault.data.size).toBe(0)
  })

  it('stays signed in when offline during refresh', async () => {
    const { auth, vault, identityStore } = setup({
      client: { refresh: async () => { throw new OAuthError('offline', 'network') } }
    })
    await save(vault, identityStore, { accessToken: 'old', refreshToken: 'rt', expiresAt: 1 })
    expect((await auth.restore()).signedIn).toBe(true)
  })

  it('discards corrupt saved data', async () => {
    const { auth, vault, identityStore } = setup()
    await save(vault, identityStore, '{not json')
    expect((await auth.restore()).signedIn).toBe(false)
    expect(vault.data.size).toBe(0)
  })
})
