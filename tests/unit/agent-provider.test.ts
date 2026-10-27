import { describe, expect, it } from 'vitest'
import { join } from 'node:path'
import {
  AcpModelService,
  AgentProviderService,
  DEFAULT_ACP_MODEL,
  detectHarnesses,
  findOpenCodeBinary,
  openCodeCandidates,
  parseVersion,
  pickAutoEngine,
  resolveOpenCodeBinary
} from '../../src/main/agent/agent-provider.js'

function memStore() {
  const data = new Map<string, unknown>()
  return {
    get: (k: string) => data.get(k),
    set: (k: string, v: unknown) => { data.set(k, v) }
  }
}

describe('AgentProviderService', () => {
  it('defaults to opencode and round-trips it', () => {
    const svc = new AgentProviderService(memStore())
    expect(svc.get()).toBe('opencode')
    expect(svc.set('opencode')).toBe('opencode')
    expect(svc.get()).toBe('opencode')
  })

  it('rejects unknown and retired engines, falling back on stored values', () => {
    const svc = new AgentProviderService(memStore())
    expect(() => svc.set('nope')).toThrow()
    expect(() => svc.set('pi')).toThrow()
    expect(() => svc.set('builtin')).toThrow()
    for (const stale of ['pi', 'builtin', '???']) {
      const store = memStore()
      store.set('agent-provider', stale)
      expect(new AgentProviderService(store).get()).toBe('opencode')
    }
  })

  it('tracks whether the user explicitly chose an engine', () => {
    const store = memStore()
    const svc = new AgentProviderService(store)
    expect(svc.hasExplicit()).toBe(false)
    svc.set('opencode')
    expect(svc.hasExplicit()).toBe(true)
    store.set('agent-provider', '???')
    expect(new AgentProviderService(store).hasExplicit()).toBe(false)
  })
})

describe('pickAutoEngine', () => {
  it('auto-connects opencode when it is installed', () => {
    expect(pickAutoEngine({ explicit: false, harnesses: [{ id: 'opencode', installed: true }] })).toBe('opencode')
    expect(pickAutoEngine({ explicit: false, harnesses: [{ id: 'opencode', installed: false }] })).toBe(null)
  })

  it('never overrides an explicit choice', () => {
    expect(pickAutoEngine({ explicit: true, harnesses: [{ id: 'opencode', installed: true }] })).toBe(null)
  })
})

describe('AcpModelService', () => {
  it('defaults to the Zed-compatible OpenCode Zen free model and round-trips explicit picks', () => {
    expect(DEFAULT_ACP_MODEL).toBe('opencode/muse-spark-1.3-contributor-free')
    const svc = new AcpModelService(memStore())
    expect(svc.get()).toBe(DEFAULT_ACP_MODEL)
    expect(svc.set(DEFAULT_ACP_MODEL)).toBe(DEFAULT_ACP_MODEL)
    expect(svc.get()).toBe(DEFAULT_ACP_MODEL)
  })

  it('rejects blank and oversized model ids', () => {
    const svc = new AcpModelService(memStore())
    expect(() => svc.set('')).toThrow()
    expect(() => svc.set('  ')).toThrow()
    expect(() => svc.set(42)).toThrow()
    expect(() => svc.set('x'.repeat(161))).toThrow()
    expect(svc.get()).toBe(DEFAULT_ACP_MODEL)
  })
})

describe('resolveOpenCodeBinary', () => {
  it('honors an explicitly configured native binary path', () => {
    expect(resolveOpenCodeBinary({ OPENCODE_BINARY: '/custom/opencode' })).toBe('/custom/opencode')
  })

  it('uses an installed native path or PATH fallback when no override is set', () => {
    expect(['/opt/homebrew/bin/opencode', '/usr/local/bin/opencode', '/usr/bin/opencode', 'opencode'])
      .toContain(resolveOpenCodeBinary({}))
  })

  it('finds the official install-script location before falling back to PATH', () => {
    expect(openCodeCandidates({ HOME: '/home/me' }, 'linux')).toContain('/home/me/.opencode/bin/opencode')
    expect(
      findOpenCodeBinary({ HOME: '/home/me' }, (p) => p === '/home/me/.opencode/bin/opencode', 'linux')
    ).toBe('/home/me/.opencode/bin/opencode')
    expect(
      findOpenCodeBinary(
        { HOME: '/home/me', PATH: '/custom/bin:/usr/bin' },
        (p) => p === '/custom/bin/opencode',
        'linux'
      )
    ).toBe('/custom/bin/opencode')
  })

  it('reports no binary when neither known paths nor PATH contain opencode', () => {
    expect(findOpenCodeBinary({ HOME: '/home/me', PATH: '/custom/bin' }, () => false, 'linux')).toBe(null)
    expect(resolveOpenCodeBinary({ HOME: '/home/me', PATH: '/custom/bin' }, () => false)).toBe('opencode')
  })

  it('detects Windows installs (npm, scoop, choco) and .exe/.cmd shims', () => {
    const env = {
      USERPROFILE: 'C:\\Users\\me',
      APPDATA: 'C:\\Users\\me\\AppData\\Roaming',
      LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local',
      PATH: 'C:\\tools'
    }
    const candidates = openCodeCandidates(env, 'win32').map((p) => p.replace(/\\/g, '/'))
    expect(candidates).toContain('C:/Users/me/scoop/shims/opencode.exe')
    expect(candidates).toContain('C:/Users/me/AppData/Roaming/npm/opencode.cmd')
    expect(candidates).toContain('C:/ProgramData/chocolatey/bin/opencode.exe')

    const onPath = findOpenCodeBinary(env, (p) => /tools[\\/]opencode\.cmd$/.test(p), 'win32')
    expect(onPath).toBe(join('C:\\tools', 'opencode.cmd'))
    expect(findOpenCodeBinary(env, () => false, 'win32')).toBe(null)
  })

  it('does not look for .exe names on macOS/Linux', () => {
    expect(openCodeCandidates({ HOME: '/home/me' }, 'linux').every((p) => !p.endsWith('.exe'))).toBe(true)
    expect(openCodeCandidates({ HOME: '/home/me' }, 'darwin')).toContain('/usr/local/bin/opencode')
  })
})

describe('parseVersion', () => {
  it('pulls semver out of CLI banners', () => {
    expect(parseVersion('opencode v2.0.20\n')).toBe('2.0.20')
    expect(parseVersion('1.1.0')).toBe('1.1.0')
  })
})

describe('detectHarnesses', () => {
  it('reports installed + missing binaries without touching the network', async () => {
    const out = await detectHarnesses({
      resolveBinary: () => 'opencode',
      run: async (bin) => {
        if (bin === 'opencode') return 'opencode v2.0.20\n'
        throw Object.assign(new Error('not found'), { code: 'ENOENT' })
      }
    })
    expect(out).toEqual([
      { id: 'opencode', installed: true, version: '2.0.20', detail: 'opencode 2.0.20 detected' }
    ])
  })

  it('probes the resolved absolute path (GUI apps have a minimal PATH)', async () => {
    const seen: string[] = []
    const out = await detectHarnesses({
      resolveBinary: () => '/home/me/.opencode/bin/opencode',
      run: async (bin) => {
        seen.push(bin)
        throw Object.assign(new Error('missing'), { code: 'ENOENT' })
      }
    })
    expect(seen).toContain('/home/me/.opencode/bin/opencode')
    expect(out[0]?.installed).toBe(false)
  })
})
