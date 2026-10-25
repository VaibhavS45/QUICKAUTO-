import { z } from 'zod'
import { execFile } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { delimiter, join } from 'node:path'

/**
 * Agent harness provider. Separate from the model provider
 * (src/main/settings/model-settings.ts): `builtin` runs the in-app Vercel AI
 * SDK loop, `opencode`/`pi` delegate whole runs to the CLI harness installed
 * on this machine, which brings its own models + auth (`pi /login`, opencode
 * config). Non-secret by design: only installed/version booleans cross IPC.
 */

export const AgentProviderSchema = z.enum(['builtin', 'opencode', 'pi'])
export type AgentProvider = z.infer<typeof AgentProviderSchema>

export const DEFAULT_AGENT_PROVIDER: AgentProvider = 'builtin'

export interface AgentProviderStore {
  get(key: string): unknown
  set(key: string, value: unknown): void
}

const PROVIDER_KEY = 'agent-provider'

export class AgentProviderService {
  constructor(private readonly store: AgentProviderStore) {}

  get(): AgentProvider {
    const parsed = AgentProviderSchema.safeParse(this.store.get(PROVIDER_KEY))
    if (!parsed.success) return DEFAULT_AGENT_PROVIDER
    return parsed.data
  }

  /** True once the user has explicitly chosen an engine — auto-select must not override it. */
  hasExplicit(): boolean {
    return AgentProviderSchema.safeParse(this.store.get(PROVIDER_KEY)).success
  }

  set(input: unknown): AgentProvider {
    const parsed = AgentProviderSchema.safeParse(input)
    if (!parsed.success) throw new Error('Invalid agent provider.')
    this.store.set(PROVIDER_KEY, parsed.data)
    return parsed.data
  }
}

export interface HarnessStatus {
  id: 'opencode' | 'pi'
  installed: boolean
  version?: string
  detail: string
}

/** `pi --version` prints `1.1.0`; `opencode --version` prints `opencode v2.0.20`. */
export function parseVersion(output: string): string {
  const m = output.match(/(\d+\.\d+\.\d+)/)
  return m ? m[1] as string : output.trim().slice(0, 40) || 'unknown'
}

export interface DetectDeps {
  /** Resolves stdout, rejects on missing binary / non-zero exit / timeout. */
  run?: (binary: string, args: string[]) => Promise<string>
  /** Binary probed per harness (defaults to the resolved opencode path). */
  resolveBinary?: (id: HarnessStatus['id']) => string
}

function defaultRun(binary: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(binary, args, { timeout: 10000 }, (err, stdout) => {
      if (err) reject(err)
      else resolve(String(stdout))
    })
  })
}

async function checkOne(
  id: HarnessStatus['id'],
  binary: string,
  run: (binary: string, args: string[]) => Promise<string>
): Promise<HarnessStatus> {
  try {
    const out = await run(binary, ['--version'])
    return { id, installed: true, version: parseVersion(out), detail: `${id} ${parseVersion(out)} detected` }
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code
    return {
      id,
      installed: false,
      detail:
        code === 'ENOENT'
          ? `${id} not found on PATH.`
          : `${id} check failed: ${err instanceof Error ? err.message : String(err)}`.slice(0, 200)
    }
  }
}

/** Detect which harnesses exist on this system. No polling — call on demand. */
export async function detectHarnesses(deps: DetectDeps = {}): Promise<HarnessStatus[]> {
  const run = deps.run ?? defaultRun
  const binaryFor =
    deps.resolveBinary ?? ((id: HarnessStatus['id']) => (id === 'opencode' ? resolveOpenCodeBinary() : id))
  return Promise.all([checkOne('opencode', binaryFor('opencode'), run), checkOne('pi', binaryFor('pi'), run)])
}

/**
 * First-run engine pick (pure). Returns a harness to auto-connect when the
 * user never chose an engine and builtin has no key — null means stay put.
 * Explicit choices always win; opencode is preferred over pi.
 */
export function pickAutoEngine(input: {
  explicit: boolean
  keySet: boolean
  harnesses: Array<{ id: string; installed: boolean }>
}): 'opencode' | 'pi' | null {
  if (input.explicit || input.keySet) return null
  for (const id of ['opencode', 'pi'] as const) {
    if (input.harnesses.some((h) => h.id === id && h.installed)) return id
  }
  return null
}

/** Default ACP model used by the Zed OpenCode integration. */
export const DEFAULT_ACP_MODEL = 'opencode/muse-spark-1.3-contributor-free'

/** Absolute paths where OpenCode lands, most specific first. */
export function openCodeCandidates(env: NodeJS.ProcessEnv = process.env): string[] {
  const out: string[] = []
  const configured = env['OPENCODE_BINARY']?.trim()
  if (configured) out.push(configured)
  const home = env['HOME'] ?? ''
  const zedRoot = join(home, 'Library/Application Support/Zed/external_agents/registry/opencode')
  try {
    const versions = readdirSync(zedRoot)
      .filter((entry) => entry.startsWith('v_'))
      .sort()
      .reverse()
    for (const version of versions) out.push(join(zedRoot, version, 'opencode'))
  } catch {
    // Zed is optional; continue with the native system installation.
  }
  if (home) {
    // Official install script (`curl -fsSL https://opencode.ai/install | bash`).
    out.push(join(home, '.opencode/bin/opencode'), join(home, '.local/bin/opencode'))
  }
  out.push('/opt/homebrew/bin/opencode', '/usr/local/bin/opencode', '/usr/bin/opencode')
  return out
}

/**
 * Locate an installed OpenCode binary without spawning anything. GUI apps get
 * a minimal PATH, so the install-script location and PATH entries are both
 * checked. Returns null when OpenCode is not on this machine.
 */
export function findOpenCodeBinary(
  env: NodeJS.ProcessEnv = process.env,
  exists: (path: string) => boolean = existsSync
): string | null {
  for (const candidate of openCodeCandidates(env)) {
    if (exists(candidate)) return candidate
  }
  for (const dir of (env['PATH'] ?? '').split(delimiter)) {
    if (!dir) continue
    const candidate = join(dir, 'opencode')
    if (exists(candidate)) return candidate
  }
  return null
}

/** Resolve the native OpenCode CLI without bundling or copying it. */
export function resolveOpenCodeBinary(
  env: NodeJS.ProcessEnv = process.env,
  exists: (path: string) => boolean = existsSync
): string {
  const configured = env['OPENCODE_BINARY']?.trim()
  if (configured) return configured
  return findOpenCodeBinary(env, exists) ?? 'opencode'
}

const ACP_MODEL_KEY = 'opencode-model'

/** Which ACP model id chat runs use. Unset = agent default. Non-secret. */
export class AcpModelService {
  constructor(private readonly store: AgentProviderStore) {}

  get(): string | null {
    const v = this.store.get(ACP_MODEL_KEY)
    if (
      v === 'opencode/big-pickle' ||
      v === 'opencode-go/longcat-2.5-preview-free' ||
      v === 'opencode/ling-3.1-flash-free'
    ) return DEFAULT_ACP_MODEL
    return typeof v === 'string' && v.length > 0 && v.length <= 160 ? v : DEFAULT_ACP_MODEL
  }

  set(input: unknown): string {
    if (typeof input !== 'string' || !input.trim() || input.trim().length > 160) {
      throw new Error('Invalid model.')
    }
    const model = input.trim()
    this.store.set(ACP_MODEL_KEY, model)
    return model
  }
}
