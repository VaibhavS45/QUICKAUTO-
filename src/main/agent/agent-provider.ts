import { z } from 'zod'
import { execFile } from 'node:child_process'

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
  run: (binary: string, args: string[]) => Promise<string>
): Promise<HarnessStatus> {
  try {
    const out = await run(id, ['--version'])
    return { id, installed: true, version: parseVersion(out), detail: `${id} ${parseVersion(out)} detected on PATH` }
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
  return Promise.all([checkOne('opencode', run), checkOne('pi', run)])
}
