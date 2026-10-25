import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

export interface LoopbackHandle {
  redirectUri: string
  /** Resolves with the authorization code; rejects on error, timeout, or close(). */
  result: Promise<{ code: string }>
  close(): void
}

const PAGE = (title: string, body: string): string =>
  `<!doctype html><meta charset="utf-8"><title>${title}</title>` +
  `<body style="font:16px system-ui;background:#0a0a0a;color:#f2f0ed;display:grid;place-items:center;height:100vh;margin:0">` +
  `<div style="text-align:center"><h2 style="margin:0 0 8px">${title}</h2><p style="color:#a8a5a0;margin:0">${body}</p></div>`

/**
 * One-shot HTTP listener on 127.0.0.1 (random port) that receives the OAuth
 * redirect. Only /callback with the expected `state` is accepted.
 */
export async function startLoopback(expectedState: string, timeoutMs = 5 * 60_000): Promise<LoopbackHandle> {
  let resolveResult!: (value: { code: string }) => void
  let rejectResult!: (reason: Error) => void
  const result = new Promise<{ code: string }>((resolve, reject) => {
    resolveResult = resolve
    rejectResult = reject
  })
  result.catch(() => {}) // never an unhandled rejection; callers still observe it

  let settled = false
  const timer: ReturnType<typeof setTimeout> = setTimeout(
    () => finish(() => rejectResult(new Error('Sign-in timed out.'))),
    timeoutMs
  )
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (url.pathname !== '/callback') {
      res.writeHead(404).end()
      return
    }
    const done = (status: number, title: string, body: string): void => {
      res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'close' })
      res.end(PAGE(title, body))
    }
    if (settled) return done(410, 'Link expired', 'You can close this tab.')
    if (url.searchParams.get('state') !== expectedState) {
      done(400, 'Sign-in failed', 'The response did not match this sign-in. Close this tab and try again.')
      finish(() => rejectResult(new Error('Sign-in failed: state mismatch.')))
      return
    }
    const error = url.searchParams.get('error')
    const code = url.searchParams.get('code')
    if (error || !code) {
      done(400, 'Sign-in cancelled', 'You can close this tab and return to Palette.')
      finish(() => rejectResult(new Error(error ? `Sign-in failed: ${error}.` : 'Sign-in failed: no code returned.')))
      return
    }
    done(200, 'Signed in', 'You can close this tab and return to Palette.')
    finish(() => resolveResult({ code }))
  })

  function finish(fn: () => void): void {
    if (settled) return
    settled = true
    fn()
    clearTimeout(timer)
    server.close()
    server.closeIdleConnections?.()
  }

  await new Promise<void>((resolve, reject) => {
    server.once('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    server.listen(0, '127.0.0.1', resolve)
  })
  const port = (server.address() as AddressInfo).port

  return {
    redirectUri: `http://127.0.0.1:${port}/callback`,
    result,
    close: () => finish(() => rejectResult(new Error('Sign-in cancelled.')))
  }
}
