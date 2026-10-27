import { execFile } from 'node:child_process'
import { findOpenCodeBinary, parseVersion } from '../../agent/agent-provider.js'

/**
 * Scheduled/automated runs must not die on "opencode not found": check for the
 * CLI, install it with the official script when it is missing, then hand the
 * resolved binary back to the ACP runner.
 *
 * Installer verified Oct 2026 (https://opencode.ai/docs): the script writes
 * `$HOME/.opencode/bin/opencode` and `--no-modify-path` keeps it from editing
 * the user's shell rc files (this app resolves the absolute path itself).
 */

export const OPENCODE_INSTALL_COMMAND =
  'curl -fsSL https://opencode.ai/install | bash -s -- --no-modify-path'

/** Installing downloads ~100MB; keep the cap generous but bounded. */
export const OPENCODE_INSTALL_TIMEOUT_MS = 5 * 60_000

export interface EnsureOpencodeResult {
  ok: boolean
  binary?: string
  version?: string
  /** True when this call installed the CLI (first run on this machine). */
  installedNow?: boolean
  error?: string
}

export interface EnsureOpencodeDeps {
  /** Absolute binary path, or null when OpenCode is not installed. */
  resolve?: () => string | null
  /** Resolves stdout of `binary --version`; rejects when it cannot run. */
  version?: (binary: string) => Promise<string>
  /** Runs the installer; resolves when it finished successfully. */
  install?: () => Promise<void>
}

function run(binary: string, args: string[], timeout: number): Promise<string> {
  return new Promise((resolve, reject) => {
    // Windows npm/scoop shims are `.cmd`/`.bat`: execFile needs a shell for those.
    const shell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(binary)
    execFile(binary, args, { timeout, maxBuffer: 1024 * 1024, shell }, (err, stdout, stderr) => {
      if (err) {
        const detail = String(stderr || err.message).trim().slice(0, 300)
        reject(new Error(detail || 'command failed'))
      } else {
        resolve(String(stdout))
      }
    })
  })
}

function defaultVersion(binary: string): Promise<string> {
  return run(binary, ['--version'], 15_000)
}

function defaultInstall(): Promise<void> {
  return run('bash', ['-c', OPENCODE_INSTALL_COMMAND], OPENCODE_INSTALL_TIMEOUT_MS).then(() => undefined)
}

async function doEnsure(deps: EnsureOpencodeDeps): Promise<EnsureOpencodeResult> {
  const resolve = deps.resolve ?? (() => findOpenCodeBinary())
  const version = deps.version ?? defaultVersion
  const install = deps.install ?? defaultInstall

  const existing = resolve()
  if (existing) {
    try {
      return { ok: true, binary: existing, version: parseVersion(await version(existing)) }
    } catch {
      // Stale path (deleted/partial install): fall through and install.
    }
  }

  try {
    await install()
  } catch (err) {
    return {
      ok: false,
      error: `OpenCode is not installed and the automatic install failed: ${
        err instanceof Error ? err.message : String(err)
      }. Install it manually: ${OPENCODE_INSTALL_COMMAND}`
    }
  }

  const installed = resolve()
  if (!installed) {
    return {
      ok: false,
      error: `OpenCode installed but no binary was found (looked in ~/.opencode/bin and PATH). Install it manually: ${OPENCODE_INSTALL_COMMAND}`
    }
  }
  try {
    return { ok: true, binary: installed, version: parseVersion(await version(installed)), installedNow: true }
  } catch (err) {
    return {
      ok: false,
      error: `OpenCode was installed but "${installed} --version" failed: ${
        err instanceof Error ? err.message : String(err)
      }`
    }
  }
}

/** Shared by concurrent runs so two automations never install at once. */
let inFlight: Promise<EnsureOpencodeResult> | null = null

/**
 * Check for OpenCode and install it when missing. Concurrent callers share one
 * check/install; deps are only for tests (they bypass the shared promise).
 */
export function ensureOpencode(deps?: EnsureOpencodeDeps): Promise<EnsureOpencodeResult> {
  if (deps) return doEnsure(deps)
  if (!inFlight) {
    inFlight = doEnsure({}).finally(() => {
      inFlight = null
    })
  }
  return inFlight
}
