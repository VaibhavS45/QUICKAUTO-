import type { AuthState } from '../../shared/contracts/auth.js'
import { OAuthError } from './auth-errors.js'
import type { Identity, OAuthConfig, Tokens } from './oidc-client.js'
import type { LoopbackHandle } from './loopback.js'
import { buildAuthorizeUrl, challengeFor, createState, createVerifier } from './pkce.js'

const TOKENS_KEY = 'auth:tokens' // encrypted with safeStorage
const IDENTITY_KEY = 'auth-identity' // non-secret display info (name/email/avatar)
const EXPIRY_SKEW_MS = 60_000

/** Encrypted secret storage (SafeStorageMcpVault satisfies this). */
export interface TokenVault {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
  delete(key: string): Promise<void>
}

export interface KeyValueStore {
  get(key: string): unknown
  set(key: string, value: unknown): void
}

export interface OAuthPort {
  exchangeCode(input: { code: string; verifier: string; redirectUri: string }): Promise<Tokens>
  refresh(refreshToken: string): Promise<Tokens>
  userInfo(accessToken: string): Promise<Identity>
}

export interface AuthDeps {
  config: OAuthConfig | null
  vault: TokenVault
  identityStore: KeyValueStore
  /** safeStorage.isAsyncEncryptionAvailable(); tokens are never stored unencrypted. */
  canEncrypt(): Promise<boolean>
  openExternal(url: string): Promise<void>
  createClient(config: OAuthConfig): OAuthPort
  startLoopback(state: string): Promise<LoopbackHandle>
}

function parseTokens(raw: string): Tokens | null {
  try {
    const v = JSON.parse(raw) as Partial<Tokens>
    if (typeof v.accessToken !== 'string' || !v.accessToken) return null
    return {
      accessToken: v.accessToken,
      ...(typeof v.refreshToken === 'string' ? { refreshToken: v.refreshToken } : {}),
      ...(typeof v.expiresAt === 'number' ? { expiresAt: v.expiresAt } : {})
    }
  } catch {
    return null
  }
}

function parseIdentity(value: unknown): Identity {
  const v = (value ?? {}) as Partial<Identity>
  return {
    name: typeof v.name === 'string' ? v.name : '',
    email: typeof v.email === 'string' ? v.email : '',
    ...(typeof v.avatarUrl === 'string' ? { avatarUrl: v.avatarUrl } : {})
  }
}

export class AuthService {
  private state: AuthState
  private readonly listeners = new Set<(state: AuthState) => void>()
  private inflight: Promise<AuthState> | null = null
  private loopback: LoopbackHandle | null = null

  constructor(private readonly deps: AuthDeps) {
    this.state = { signedIn: false, configured: deps.config !== null }
  }

  getState(): AuthState {
    return this.state
  }

  onChange(listener: (state: AuthState) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Startup: restore a saved session. Never throws; no timers, no polling. */
  async restore(): Promise<AuthState> {
    try {
      const raw = await this.deps.vault.get(TOKENS_KEY)
      if (!raw) return this.state
      let tokens = parseTokens(raw)
      if (!tokens) {
        await this.clearSession()
        return this.state
      }
      const expired = tokens.expiresAt !== undefined && tokens.expiresAt - EXPIRY_SKEW_MS < Date.now()
      if (expired) {
        if (!tokens.refreshToken || !this.deps.config) {
          await this.clearSession()
          return this.state
        }
        try {
          tokens = await this.deps.createClient(this.deps.config).refresh(tokens.refreshToken)
          await this.deps.vault.set(TOKENS_KEY, JSON.stringify(tokens))
        } catch (error) {
          // Provider said no → signed out. Offline → keep the cached identity.
          if (error instanceof OAuthError && error.kind === 'network') {
            return this.publish(this.signedInState())
          }
          await this.clearSession()
          return this.state
        }
      }
      return this.publish(this.signedInState())
    } catch {
      return this.state
    }
  }

  signIn(): Promise<AuthState> {
    if (this.inflight) return this.inflight
    const run = this.runSignIn().finally(() => {
      this.inflight = null
      this.loopback = null
    })
    this.inflight = run
    return run
  }

  async signOut(): Promise<AuthState> {
    this.loopback?.close()
    await this.clearSession()
    return this.state
  }

  private async runSignIn(): Promise<AuthState> {
    const { config } = this.deps
    if (!config) {
      throw new Error('Sign-in is not configured. Set the PALETTE_OAUTH_* environment variables (see README).')
    }
    if (!(await this.deps.canEncrypt())) {
      throw new Error('Secure storage is unavailable on this system, so sign-in is disabled.')
    }
    const client = this.deps.createClient(config)
    const verifier = createVerifier()
    const state = createState()
    const loopback = await this.deps.startLoopback(state)
    this.loopback = loopback
    try {
      await this.deps.openExternal(
        buildAuthorizeUrl({
          authUrl: config.authUrl,
          clientId: config.clientId,
          redirectUri: loopback.redirectUri,
          scopes: config.scopes,
          state,
          challenge: challengeFor(verifier),
          ...(config.extraAuthParams ? { extra: config.extraAuthParams } : {})
        })
      )
      const { code } = await loopback.result
      const tokens = await client.exchangeCode({ code, verifier, redirectUri: loopback.redirectUri })
      const identity = await client.userInfo(tokens.accessToken)
      await this.deps.vault.set(TOKENS_KEY, JSON.stringify(tokens))
      this.deps.identityStore.set(IDENTITY_KEY, identity)
      return this.publish(this.signedInState())
    } finally {
      loopback.close()
    }
  }

  private signedInState(): AuthState {
    const id = parseIdentity(this.deps.identityStore.get(IDENTITY_KEY))
    return {
      signedIn: true,
      configured: this.deps.config !== null,
      name: id.name || id.email || 'Account',
      email: id.email,
      ...(id.avatarUrl ? { avatarUrl: id.avatarUrl } : {})
    }
  }

  private async clearSession(): Promise<void> {
    await this.deps.vault.delete(TOKENS_KEY)
    this.deps.identityStore.set(IDENTITY_KEY, null)
    this.publish({ signedIn: false, configured: this.deps.config !== null })
  }

  private publish(next: AuthState): AuthState {
    this.state = next
    for (const listener of this.listeners) listener(next)
    return next
  }
}
