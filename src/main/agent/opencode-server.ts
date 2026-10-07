import { createOpencodeClient, type OpencodeClient } from '@opencode-ai/sdk'
import { spawn, type ChildProcess } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { createServer } from 'node:net'

/**
 * Manages one `opencode serve` child process for the app lifetime.
 *
 * Docs verified Oct 2026 (opencode.ai/docs/server + installed
 * @opencode-ai/sdk 1.18.35):
 * - `opencode serve --hostname 127.0.0.1 --port <n>` (port 0 also works, but
 *   we pick a free port explicitly so we know the URL up front).
 * - Password: `OPENCODE_SERVER_PASSWORD` env -> HTTP basic auth
 *   (username `opencode`). The SDK client takes a custom `fetch`, so we
 *   inject the Authorization header there.
 * - Attach: `createOpencodeClient({ baseUrl, fetch })`.
 * - Killed on app quit (see index.ts will-quit).
 */

export type OpencodeClientLike = Pick<OpencodeClient, 'session' | 'event' | 'postSessionIdPermissionsPermissionId'>

export interface ServerManagerDeps {
  binary?: string
  spawnFn?: (cmd: string, args: string[], opts: { env: NodeJS.ProcessEnv }) => ChildProcess
  pickPort?: () => Promise<number>
  pollHealth?: (url: string, headers: Record<string, string>) => Promise<boolean>
  createClient?: (baseUrl: string, password: string) => OpencodeClientLike
  startupTimeoutMs?: number
}

function defaultPickPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer()
    s.once('error', reject)
    s.listen(0, '127.0.0.1', () => {
      const addr = s.address()
      const port = typeof addr === 'object' && addr ? addr.port : 0
      s.close(() => resolve(port))
    })
  })
}

async function defaultPollHealth(url: string, headers: Record<string, string>): Promise<boolean> {
  try {
    const res = await fetch(`${url}/global/health`, { headers })
    if (!res.ok) return false
    const body = (await res.json()) as { healthy?: boolean }
    return body.healthy === true
  } catch {
    return false
  }
}

function defaultCreateClient(baseUrl: string, password: string): OpencodeClientLike {
  const basic = `Basic ${Buffer.from(`opencode:${password}`).toString('base64')}`
  const authedFetch = (req: Request): ReturnType<typeof fetch> =>
    globalThis.fetch(req, { headers: { Authorization: basic } })
  return createOpencodeClient({ baseUrl, fetch: authedFetch }) as unknown as OpencodeClientLike
}

export class OpencodeServerManager {
  private child: ChildProcess | null = null
  private baseUrl: string | null = null
  private starting: Promise<string> | null = null
  private stderrTail = ''

  constructor(private readonly deps: ServerManagerDeps = {}) {}

  get running(): boolean {
    return this.child !== null && this.baseUrl !== null
  }

  get url(): string | null {
    return this.baseUrl
  }

  /** Start once; concurrent callers share the same startup. */
  async start(): Promise<string> {
    if (this.baseUrl) return this.baseUrl
    if (!this.starting) {
      const attempt = this.launch()
      // On failure clear so a later start() retries.
      attempt.catch(() => {
        if (!this.baseUrl) this.starting = null
      })
      this.starting = attempt
    }
    return this.starting
  }

  client(): OpencodeClientLike {
    if (!this.baseUrl) throw new Error('OpenCode server is not running.')
    return (this.deps.createClient ?? defaultCreateClient)(this.baseUrl, this.passwordOrThrow())
  }

  private passwordOrThrow(): string {
    if (!this._password) throw new Error('OpenCode server is not running.')
    return this._password
  }
  private _password: string | null = null

  async stop(): Promise<void> {
    this.starting = null
    const child = this.child
    this.child = null
    this.baseUrl = null
    this._password = null
    if (!child) return
    await new Promise<void>((resolve) => {
      const done = (): void => resolve()
      child.once('exit', done)
      try {
        child.kill('SIGTERM')
      } catch {
        done()
      }
      setTimeout(() => {
        try {
          if (child.exitCode === null) child.kill('SIGKILL')
        } catch {
          /* already gone */
        }
        done()
      }, 5000).unref?.()
    })
  }

  private async launch(): Promise<string> {
    const binary = this.deps.binary ?? 'opencode'
    const port = await (this.deps.pickPort ?? defaultPickPort)()
    const password = randomBytes(32).toString('base64url')
    const url = `http://127.0.0.1:${port}`
    const spawnFn =
      this.deps.spawnFn ??
      ((cmd: string, args: string[], opts: { env: NodeJS.ProcessEnv }) => spawn(cmd, args, opts))

    let child: ChildProcess
    try {
      child = spawnFn(binary, ['serve', '--hostname', '127.0.0.1', '--port', String(port), '--log-level', 'ERROR'], {
        env: { ...process.env, OPENCODE_SERVER_PASSWORD: password }
      })
    } catch (err) {
      throw new Error(
        `Could not start "opencode serve": ${(err as Error).message}. Install OpenCode (https://opencode.ai) and ensure "opencode" is on PATH.`
      )
    }
    this.child = child
    this._password = password
    child.stderr?.on('data', (d: Buffer) => {
      this.stderrTail = `${this.stderrTail}${d.toString()}`.slice(-2000)
    })
    const earlyExit = new Promise<never>((_, reject) => {
      child.once('error', (err) => {
        const e = err as NodeJS.ErrnoException
        reject(
          e.code === 'ENOENT'
            ? new Error('opencode binary not found on PATH. Install OpenCode (https://opencode.ai) first.')
            : new Error(`opencode serve failed to spawn: ${e.message}`)
        )
      })
      child.once('exit', (code) => {
        reject(new Error(`opencode serve exited early (code ${code}): ${this.stderrTail || 'no output'}`))
      })
    })

    const headers = { Authorization: `Basic ${Buffer.from(`opencode:${password}`).toString('base64')}` }
    const pollHealth = this.deps.pollHealth ?? defaultPollHealth
    const timeoutMs = this.deps.startupTimeoutMs ?? 25000
    const deadline = Date.now() + timeoutMs
    try {
      for (;;) {
        if (Date.now() > deadline) throw new Error('Timed out waiting for opencode serve to become healthy.')
        const healthy = await Promise.race([pollHealth(url, headers), earlyExit.then(() => false)])
        if (healthy) break
        await new Promise((r) => setTimeout(r, 250))
      }
    } catch (err) {
      await this.stop()
      throw err
    }
    this.baseUrl = url
    return url
  }
}
