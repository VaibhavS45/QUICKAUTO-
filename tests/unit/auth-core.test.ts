import { describe, expect, it } from 'vitest'
import { buildAuthorizeUrl, challengeFor, createState, createVerifier } from '../../src/main/auth/pkce.js'
import { startLoopback } from '../../src/main/auth/loopback.js'
import { OAuthClient, readOAuthConfig } from '../../src/main/auth/oidc-client.js'

describe('pkce', () => {
  it('matches the RFC 7636 test vector', () => {
    expect(challengeFor('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe(
      'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
    )
  })
  it('creates url-safe random values', () => {
    expect(createVerifier()).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(createState()).not.toBe(createState())
  })
  it('adds extra params but never overrides the security ones', () => {
    const url = new URL(buildAuthorizeUrl({
      authUrl: 'https://idp.test/authorize', clientId: 'c', redirectUri: 'http://127.0.0.1:1/callback',
      scopes: 'openid', state: 's', challenge: 'ch', extra: { access_type: 'offline', state: 'evil', code_challenge: 'evil' }
    }))
    expect(url.searchParams.get('access_type')).toBe('offline')
    expect(url.searchParams.get('state')).toBe('s')
    expect(url.searchParams.get('code_challenge')).toBe('ch')
  })
  it('builds an S256 authorize url', () => {
    const url = new URL(buildAuthorizeUrl({
      authUrl: 'https://idp.test/authorize', clientId: 'c', redirectUri: 'http://127.0.0.1:1/callback',
      scopes: 'openid', state: 's', challenge: 'ch'
    }))
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('response_type')).toBe('code')
  })
})

describe('loopback', () => {
  it('resolves the code when the state matches', async () => {
    const lb = await startLoopback('good')
    const res = await fetch(`${lb.redirectUri}?code=abc&state=good`)
    expect(res.status).toBe(200)
    await expect(lb.result).resolves.toEqual({ code: 'abc' })
  })
  it('rejects a wrong state', async () => {
    const lb = await startLoopback('good')
    const res = await fetch(`${lb.redirectUri}?code=abc&state=evil`)
    expect(res.status).toBe(400)
    await expect(lb.result).rejects.toThrow('state mismatch')
  })
  it('rejects when the provider returns an error, and on close()', async () => {
    const a = await startLoopback('s')
    await fetch(`${a.redirectUri}?error=access_denied&state=s`)
    await expect(a.result).rejects.toThrow('access_denied')
    const b = await startLoopback('s')
    b.close()
    await expect(b.result).rejects.toThrow('cancelled')
  })
  it('times out', async () => {
    const lb = await startLoopback('s', 20)
    await expect(lb.result).rejects.toThrow('timed out')
  })
  it('ignores other paths', async () => {
    const lb = await startLoopback('s')
    const res = await fetch(lb.redirectUri.replace('/callback', '/nope'))
    expect(res.status).toBe(404)
    lb.close()
    await lb.result.catch(() => {})
  })
})

describe('oauth config + client', () => {
  const env = {
    PALETTE_OAUTH_CLIENT_ID: 'id',
    PALETTE_OAUTH_AUTH_URL: 'https://idp.test/authorize',
    PALETTE_OAUTH_TOKEN_URL: 'https://idp.test/token',
    PALETTE_OAUTH_USERINFO_URL: 'https://idp.test/userinfo'
  }
  it('requires every field and https', () => {
    expect(readOAuthConfig(env)?.scopes).toBe('openid profile email')
    expect(readOAuthConfig({ ...env, PALETTE_OAUTH_TOKEN_URL: 'http://evil.test/token' })).toBeNull()
    expect(readOAuthConfig({ PALETTE_OAUTH_CLIENT_ID: 'id' })).toBeNull()
    expect(readOAuthConfig({ ...env, PALETTE_OAUTH_AUTH_PARAMS: 'access_type=offline&prompt=consent' })?.extraAuthParams)
      .toEqual({ access_type: 'offline', prompt: 'consent' })
  })
  it('exchanges a code, sends the PKCE verifier, and maps the profile', async () => {
    const seen: string[] = []
    const fake = (async (url: string, init?: RequestInit) => {
      if (String(url).endsWith('/token')) {
        seen.push(String(init?.body))
        return new Response(JSON.stringify({ access_token: 'a', refresh_token: 'r', expires_in: 3600 }), { status: 200 })
      }
      return new Response(JSON.stringify({ name: 'Ada', email: 'ada@x.test', picture: 'https://x.test/a.png', avatar_url: null }), { status: 200 })
    }) as unknown as typeof fetch
    const client = new OAuthClient(readOAuthConfig(env)!, fake)
    const tokens = await client.exchangeCode({ code: 'c', verifier: 'v', redirectUri: 'http://127.0.0.1:1/callback' })
    expect(seen[0]).toContain('code_verifier=v')
    expect(tokens.refreshToken).toBe('r')
    expect(await client.userInfo('a')).toEqual({ name: 'Ada', email: 'ada@x.test', avatarUrl: 'https://x.test/a.png' })
  })
  it('classifies rejections vs network failures', async () => {
    const cfg = readOAuthConfig(env)!
    const rejected = new OAuthClient(cfg, (async () => new Response('{"error":"invalid_grant"}', { status: 400 })) as unknown as typeof fetch)
    await expect(rejected.refresh('r')).rejects.toMatchObject({ kind: 'rejected' })
    const offline = new OAuthClient(cfg, (async () => { throw new TypeError('fetch failed') }) as unknown as typeof fetch)
    await expect(offline.refresh('r')).rejects.toMatchObject({ kind: 'network' })
  })
})
