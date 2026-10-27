import { z } from 'zod'
import { execFile } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Agent harness provider. OpenCode is the only engine the app offers: runs are
 * delegated to the OpenCode CLI/ACP installed on this machine, which brings its
 * own models + auth (`opencode auth login`). `builtin` (the in-app Vercel AI
 * SDK loop) stays only as an internal/test path; any other stored value — the
 * retired `pi` engine included — falls back to OpenCode.
 * Non-secret by design: only installed/version booleans cross IPC.
 */

export const AgentProviderSchema = z.enum(['opencode'])
export type AgentProvider = 'opencode' | 'builtin'

export const DEFAULT_AGENT_PROVIDER: AgentProvider = 'opencode'

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
  id: 'opencode'
  installed: boolean
  version?: string
  detail: string
}

/** `opencode --version` prints `opencode v2.0.20`. */
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
    // Windows npm/scoop shims are `.cmd`/`.bat`: execFile needs a shell for those.
    const shell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(binary)
    execFile(binary, args, { timeout: 10000, shell }, (err, stdout) => {
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

/** Detect whether OpenCode exists on this system. No polling — call on demand. */
export async function detectHarnesses(deps: DetectDeps = {}): Promise<HarnessStatus[]> {
  const run = deps.run ?? defaultRun
  const binaryFor = deps.resolveBinary ?? (() => resolveOpenCodeBinary())
  return [await checkOne('opencode', binaryFor('opencode'), run)]
}

/**
 * First-run engine pick (pure). OpenCode is the only engine the app offers, so
 * this just records it explicitly once it is installed.
 */
export function pickAutoEngine(input: {
  explicit: boolean
  harnesses: Array<{ id: string; installed: boolean }>
}): 'opencode' | null {
  if (input.explicit) return null
  return input.harnesses.some((h) => h.id === 'opencode' && h.installed) ? 'opencode' : null
}

/** Default ACP model used by the Zed OpenCode integration. */
export const DEFAULT_ACP_MODEL = 'opencode/muse-spark-1.3-contributor-free'

/**
 * File names `opencode` shows up as on this platform. Windows installs via
 * npm/choco/scoop land as `opencode.cmd` or `opencode.exe`.
 */
export function openCodeBinaryNames(platform: NodeJS.Platform = process.platform): string[] {
  return platform === 'win32'
    ? ['opencode.exe', 'opencode.cmd', 'opencode.bat', 'opencode']
    : ['opencode']
}

/** Absolute paths where OpenCode lands, most specific first. */
export function openCodeCandidates(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform
): string[] {
  const out: string[] = []
  const configured = env['OPENCODE_BINARY']?.trim()
  if (configured) out.push(configured)
  const names = openCodeBinaryNames(platform)
  const add = (dir: string): void => {
    for (const name of names) out.push(join(dir, name))
  }
  const home = (platform === 'win32' ? env['USERPROFILE'] ?? env['HOME'] : env['HOME']) ?? ''

  if (platform === 'win32') {
    const appData = env['APPDATA'] ?? (home && join(home, 'AppData/Roaming'))
    const localAppData = env['LOCALAPPDATA'] ?? (home && join(home, 'AppData/Local'))
    if (home) {
      add(join(home, '.opencode/bin')) // install script / released binary
      add(join(home, '.local/bin'))
      add(join(home, '.bun/bin'))
      add(join(home, 'scoop/shims')) // scoop install opencode
    }
    if (appData) add(join(appData, 'npm')) // npm install -g opencode-ai
    if (localAppData) add(join(localAppData, 'mise/shims')) // mise use -g
    add('C:\\ProgramData\\chocolatey\\bin') // choco install opencode
    return out
  }

  if (platform === 'darwin' && home) {
    const zedRoot = join(home, 'Library/Application Support/Zed/external_agents/registry/opencode')
    try {
      const versions = readdirSync(zedRoot)
        .filter((entry) => entry.startsWith('v_'))
        .sort()
        .reverse()
      for (const version of versions) add(join(zedRoot, version))
    } catch {
      // Zed is optional; continue with the native system installation.
    }
  }
  if (home) {
    // Official install script (`curl -fsSL https://opencode.ai/install | bash`).
    add(join(home, '.opencode/bin'))
    add(join(home, '.local/bin'))
    add(join(home, '.bun/bin'))
  }
  add('/opt/homebrew/bin') // brew (Apple Silicon)
  add('/usr/local/bin') // brew (Intel)
  add('/usr/bin')
  add('/snap/bin') // Linux (snap)
  return out
}

/**
 * Locate an installed OpenCode binary without spawning anything. GUI apps get
 * a minimal PATH, so the install-script location and PATH entries are both
 * checked. Returns null when OpenCode is not on this machine.
 */
export function findOpenCodeBinary(
  env: NodeJS.ProcessEnv = process.env,
  exists: (path: string) => boolean = existsSync,
  platform: NodeJS.Platform = process.platform
): string | null {
  for (const candidate of openCodeCandidates(env, platform)) {
    if (exists(candidate)) return candidate
  }
  // `delimiter` is the host's; use the target platform's so tests can fake Windows.
  const pathSeparator = platform === 'win32' ? ';' : ':'
  for (const dir of (env['PATH'] ?? '').split(pathSeparator)) {
    if (!dir) continue
    for (const name of openCodeBinaryNames(platform)) {
      const candidate = join(dir, name)
      if (exists(candidate)) return candidate
    }
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
