import { describe, expect, it, vi } from 'vitest'
import { ensureOpencode, OPENCODE_INSTALL_COMMAND } from '../../src/main/engines/opencode/opencode-install.js'

function deps(overrides: {
  resolve: () => string | null
  version?: (binary: string) => Promise<string>
  install?: () => Promise<void>
}) {
  return {
    resolve: overrides.resolve,
    version: overrides.version ?? (async () => 'opencode v2.0.20\n'),
    install: overrides.install ?? vi.fn(async () => {})
  }
}

describe('ensureOpencode', () => {
  it('reuses an installed binary without running the installer', async () => {
    const install = vi.fn(async () => {})
    const out = await ensureOpencode(deps({ resolve: () => '/home/me/.opencode/bin/opencode', install }))
    expect(out).toMatchObject({ ok: true, binary: '/home/me/.opencode/bin/opencode', version: '2.0.20' })
    expect(install).not.toHaveBeenCalled()
  })

  it('installs when missing and returns the new binary', async () => {
    let installed = false
    const install = vi.fn(async () => {
      installed = true
    })
    const out = await ensureOpencode(
      deps({ resolve: () => (installed ? '/home/me/.opencode/bin/opencode' : null), install })
    )
    expect(install).toHaveBeenCalledTimes(1)
    expect(out).toMatchObject({ ok: true, binary: '/home/me/.opencode/bin/opencode', installedNow: true })
  })

  it('reinstalls when the resolved path is stale', async () => {
    let installed = false
    const version = vi.fn(async (binary: string) => {
      if (!installed) throw new Error('ENOENT')
      return binary.endsWith('opencode') ? 'opencode v2.0.20\n' : 'nope'
    })
    const install = vi.fn(async () => {
      installed = true
    })
    const out = await ensureOpencode(deps({ resolve: () => '/old/opencode', version, install }))
    expect(install).toHaveBeenCalledTimes(1)
    expect(out.ok).toBe(true)
  })

  it('reports a failed install with the manual command', async () => {
    const out = await ensureOpencode(
      deps({
        resolve: () => null,
        install: async () => {
          throw new Error('curl: (6) could not resolve host')
        }
      })
    )
    expect(out.ok).toBe(false)
    expect(out.error).toContain('could not resolve host')
    expect(out.error).toContain(OPENCODE_INSTALL_COMMAND)
  })

  it('fails clearly when the installer leaves no binary behind', async () => {
    const out = await ensureOpencode(deps({ resolve: () => null }))
    expect(out.ok).toBe(false)
    expect(out.error).toContain('no binary was found')
  })

  it('fails clearly when the installed binary cannot report a version', async () => {
    const out = await ensureOpencode(
      deps({
        resolve: () => '/home/me/.opencode/bin/opencode',
        version: async () => {
          throw new Error('permission denied')
        },
        install: async () => {}
      })
    )
    expect(out.ok).toBe(false)
    expect(out.error).toContain('permission denied')
  })
})
