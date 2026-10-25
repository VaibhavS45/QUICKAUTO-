import { createHash, randomBytes } from 'node:crypto'

const b64url = (buf: Buffer): string => buf.toString('base64url')

export function createVerifier(): string {
  return b64url(randomBytes(32)) // 43 chars, RFC 7636 compliant
}

export function challengeFor(verifier: string): string {
  return b64url(createHash('sha256').update(verifier).digest())
}

export function createState(): string {
  return b64url(randomBytes(16))
}

export function buildAuthorizeUrl(opts: {
  authUrl: string
  clientId: string
  redirectUri: string
  scopes: string
  state: string
  challenge: string
  extra?: Record<string, string>
}): string {
  const url = new URL(opts.authUrl)
  for (const [key, value] of Object.entries(opts.extra ?? {})) url.searchParams.set(key, value)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', opts.clientId)
  url.searchParams.set('redirect_uri', opts.redirectUri)
  url.searchParams.set('scope', opts.scopes)
  url.searchParams.set('state', opts.state)
  url.searchParams.set('code_challenge', opts.challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  return url.toString()
}
