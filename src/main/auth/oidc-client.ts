import { z } from 'zod'
import { OAuthError } from './auth-errors.js'

export interface OAuthConfig {
  clientId: string
  clientSecret?: string
  authUrl: string
  tokenUrl: string
  userInfoUrl: string
  scopes: string
  /** Extra authorize-request params, e.g. access_type=offline for Google refresh tokens. */
  extraAuthParams?: Record<string, string>
}

export interface Tokens {
  accessToken: string
  refreshToken?: string
  /** epoch ms; undefined = provider gave no expiry */
  expiresAt?: number
}

export interface Identity {
  name: string
  email: string
  avatarUrl?: string
}

function secureUrl(value: string | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    const local = url.hostname === 'localhost' || url.hostname === '127.0.0.1'
    return url.protocol === 'https:' || (url.protocol === 'http:' && local) ? url.toString() : null
  } catch {
    return null
  }
}

/** Reads the provider from env. Returns null (sign-in disabled) unless fully and safely configured. */
export function readOAuthConfig(env: Record<string, string | undefined> = process.env): OAuthConfig | null {
  const clientId = env['PALETTE_OAUTH_CLIENT_ID']?.trim()
  const authUrl = secureUrl(env['PALETTE_OAUTH_AUTH_URL'])
  const tokenUrl = secureUrl(env['PALETTE_OAUTH_TOKEN_URL'])
  const userInfoUrl = secureUrl(env['PALETTE_OAUTH_USERINFO_URL'])
  if (!clientId || !authUrl || !tokenUrl || !userInfoUrl) return null
  const clientSecret = env['PALETTE_OAUTH_CLIENT_SECRET']?.trim()
  const extra = Object.fromEntries(new URLSearchParams(env['PALETTE_OAUTH_AUTH_PARAMS'] ?? ''))
  return {
    clientId,
    authUrl,
    tokenUrl,
    userInfoUrl,
    scopes: env['PALETTE_OAUTH_SCOPES']?.trim() || 'openid profile email',
    ...(clientSecret ? { clientSecret } : {}),
    ...(Object.keys(extra).length ? { extraAuthParams: extra } : {})
  }
}

const TokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().optional(),
  expires_in: z.number().positive().optional()
})

const UserInfoSchema = z
  .object({
    name: z.string().nullish(),
    preferred_username: z.string().nullish(),
    login: z.string().nullish(),
    email: z.string().nullish(),
    picture: z.string().nullish(),
    avatar_url: z.string().nullish()
  })
  .passthrough()

export class OAuthClient {
  constructor(
    private readonly cfg: OAuthConfig,
    private readonly fetchFn: typeof fetch = fetch
  ) {}

  exchangeCode(input: { code: string; verifier: string; redirectUri: string }): Promise<Tokens> {
    return this.tokenRequest({
      grant_type: 'authorization_code',
      code: input.code,
      redirect_uri: input.redirectUri,
      code_verifier: input.verifier
    })
  }

  async refresh(refreshToken: string): Promise<Tokens> {
    const next = await this.tokenRequest({ grant_type: 'refresh_token', refresh_token: refreshToken })
    // Providers often omit a new refresh token; keep the old one.
    return { ...next, refreshToken: next.refreshToken ?? refreshToken }
  }

  async userInfo(accessToken: string): Promise<Identity> {
    const res = await this.send(this.cfg.userInfoUrl, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }
    })
    const parsed = UserInfoSchema.safeParse(await this.json(res))
    if (!parsed.success) throw new OAuthError('The provider returned an unreadable profile.', 'invalid')
    const d = parsed.data
    const avatar = d.picture ?? d.avatar_url
    return {
      name: (d.name ?? d.preferred_username ?? d.login ?? '').slice(0, 80),
      email: (d.email ?? '').slice(0, 254),
      ...(avatar ? { avatarUrl: avatar } : {})
    }
  }

  private async tokenRequest(params: Record<string, string>): Promise<Tokens> {
    const body = new URLSearchParams({ ...params, client_id: this.cfg.clientId })
    if (this.cfg.clientSecret) body.set('client_secret', this.cfg.clientSecret)
    const res = await this.send(this.cfg.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body
    })
    const parsed = TokenResponseSchema.safeParse(await this.json(res))
    if (!parsed.success) throw new OAuthError('The provider returned an unreadable token response.', 'invalid')
    const t = parsed.data
    return {
      accessToken: t.access_token,
      ...(t.refresh_token ? { refreshToken: t.refresh_token } : {}),
      ...(t.expires_in ? { expiresAt: Date.now() + t.expires_in * 1000 } : {})
    }
  }

  private async send(url: string, init: RequestInit): Promise<Response> {
    let res: Response
    try {
      res = await this.fetchFn(url, { ...init, signal: AbortSignal.timeout(15_000) })
    } catch {
      throw new OAuthError('Could not reach the sign-in provider.', 'network')
    }
    if (!res.ok) {
      // Only the standard `error` code is surfaced; bodies can contain secrets.
      let code = ''
      try {
        const data = (await res.json()) as { error?: unknown }
        if (typeof data.error === 'string') code = `: ${data.error.slice(0, 60)}`
      } catch {
        /* non-JSON error body */
      }
      throw new OAuthError(`The provider rejected the request (${res.status}${code}).`, 'rejected')
    }
    return res
  }

  private async json(res: Response): Promise<unknown> {
    try {
      return await res.json()
    } catch {
      throw new OAuthError('The provider returned a non-JSON response.', 'invalid')
    }
  }
}
