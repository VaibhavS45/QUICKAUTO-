import { EventEmitter } from 'node:events'
import { describe, expect, it, afterEach } from 'vitest'
import {
  GitHubResolveProvider,
  GITHUB_RESOLVE_PROMPT,
  GITHUB_RESOLVE_TOOLS,
  resolveBranchName,
  type ResolveDeps
} from '../../src/main/connectors/github-resolve.js'
import { APPROVAL_REQUIRED_TOOLS, buildToolApproval } from '../../src/main/agent/tools.js'
import { buildInstructions } from '../../src/main/agent/registry.js'
import { runWithContext } from '../../src/main/agent/run-context.js'
import {
  setNestedApprovalHandler,
  requestNestedApprovalForCurrentRun
} from '../../src/main/agent/nested-approval.js'
import {
  classifyOpencodePermission,
  parseResolveOutcome,
  runOpencodeResolve
} from '../../src/main/agent/opencode-resolve.js'
import { OpencodeServerManager } from '../../src/main/agent/opencode-server.js'
import type { ServerManagerDeps } from '../../src/main/agent/opencode-server.js'
import type { GitHubRepoEntry, RunResult } from '../../src/main/connectors/github-cli.js'

afterEach(() => {
  setNestedApprovalHandler(null)
})

type AnyTool = { execute: (input: never) => Promise<unknown> }

interface Scripted {
  match: (cmd: string, args: string[]) => boolean
  stdout?: string
  throwErr?: string
}

class Script {
  calls: Array<{ cmd: string; args: string[]; cwd?: string }> = []
  constructor(private readonly handlers: Scripted[] = []) {}
  run = async (cmd: 'git' | 'gh', args: string[], cwd?: string): Promise<RunResult> => {
    this.calls.push({ cmd, args, cwd })
    const h = this.handlers.find((x) => x.match(cmd, args))
    if (!h) throw new Error(`unexpected call: ${cmd} ${args.join(' ')}`)
    if (h.throwErr) {
      throw Object.assign(new Error(h.throwErr), { stdout: '', stderr: h.throwErr })
    }
    return { stdout: h.stdout ?? '', stderr: '' }
  }
  argv(cmd: string, first: string): string[][] {
    // Matches runs where `first` is the git subcommand, tolerating leading
    // global flags such as `-c key=val` before it.
    return this.calls.filter((c) => c.cmd === cmd && c.args.includes(first)).map((c) => c.args)
  }
}

const REPOS: GitHubRepoEntry[] = [{ path: '/tmp/fake-repo', repo: 'acme/widget', testCommand: 'npm test' }]
const PR_VIEW = JSON.stringify({
  number: 12,
  title: 'Cool feature',
  mergeable: 'CONFLICTING',
  mergeStateStatus: 'DIRTY',
  headRefName: 'feature',
  baseRefName: 'main'
})
const REPO_VIEW = JSON.stringify({ defaultBranchRef: { name: 'main' } })

function resolveScript(): Script {
  return new Script([
    { match: (c, a) => c === 'gh' && a.includes('pr'), stdout: PR_VIEW },
    { match: (c, a) => c === 'gh' && a.includes('repo'), stdout: REPO_VIEW },
    { match: (c, a) => c === 'git' && a.includes('status'), stdout: '' },
    { match: (c, a) => c === 'git' && a.includes('show-ref'), throwErr: 'not exists' },
    { match: (c, a) => c === 'git' && a.includes('fetch'), stdout: '' },
    { match: (c, a) => c === 'git' && a.includes('checkout'), stdout: '' },
    { match: (c, a) => c === 'git' && a.includes('merge') && !a.includes('--abort'), throwErr: 'conflict' },
    { match: (c, a) => c === 'git' && a.includes('--diff-filter=U'), stdout: 'a.ts\nb.ts\n' },
    { match: (c, a) => c === 'git' && a.includes('--stat'), stdout: 'stat' },
    { match: (c, a) => c === 'git' && a.includes('diff'), stdout: 'DIFF-BODY' },
    { match: () => true, stdout: '' }
  ])
}

function providerWith(script: Script, repos: GitHubRepoEntry[] = REPOS, opencodeResolve?: ResolveDeps['opencodeResolve']) {
  const fakeManager = {
    start: async () => 'http://127.0.0.1:1',
    client: () => ({})
  }
  return new GitHubResolveProvider({
    getRepos: () => repos,
    run: script.run,
    getOpencode: () => fakeManager as unknown as OpencodeServerManager,
    opencodeResolve:
      opencodeResolve ??
      (async () => ({ summary: 'resolved both', resolved: ['a.ts', 'b.ts'], unresolved: [] }))
  })
}

function toolsOf(p: GitHubResolveProvider): Record<string, AnyTool> {
  return p.getTools(['github']) as unknown as Record<string, AnyTool>
}

describe('tool surface + approvals', () => {
  it('exposes the three resolve tools for @github only', () => {
    const p = providerWith(resolveScript())
    expect(Object.keys(toolsOf(p)).sort()).toEqual([...GITHUB_RESOLVE_TOOLS].sort())
    expect(p.getTools([])).toEqual({})
  })

  it('all three require approval; scheduled denies', () => {
    for (const name of GITHUB_RESOLVE_TOOLS) {
      expect(APPROVAL_REQUIRED_TOOLS.has(name)).toBe(true)
    }
    const palette = buildToolApproval('palette', [...GITHUB_RESOLVE_TOOLS])
    for (const name of GITHUB_RESOLVE_TOOLS) expect(palette[name]).toBe('user-approval')
    const scheduled = buildToolApproval('scheduled', [...GITHUB_RESOLVE_TOOLS])
    for (const name of GITHUB_RESOLVE_TOOLS) {
      expect(scheduled[name]).toEqual({ type: 'denied', reason: expect.stringContaining('Scheduled runs') })
    }
  })

  it('resolve prompt teaches the gated flow', () => {
    expect(buildInstructions('palette', ['github'])).toContain('Only after they approve the diff')
    expect(GITHUB_RESOLVE_PROMPT).toMatch(/never force-push/i)
  })
})

describe('resolve flow (happy path)', () => {
  it('creates a NEW branch from the PR head, never touches default', async () => {
    const script = resolveScript()
    const p = providerWith(script)
    const out = (await toolsOf(p)['github_resolve_conflicts']!.execute({ repo: 'acme/widget', pr: 12 } as never)) as {
      branch: string
      resolved: string[]
      diff: string
    }
    expect(out.branch.startsWith('palette/resolve-pr-12-')).toBe(true)
    expect(out.resolved).toEqual(['a.ts', 'b.ts'])
    expect(out.diff).toContain('DIFF-BODY')
    const checkouts = script.argv('git', 'checkout').map((a) => a[1])
    expect(checkouts).toHaveLength(1)
    expect(checkouts[0]).toBe(out.branch)
    expect(checkouts[0]).not.toMatch(/^(main|master)$/)
    const fetches = script.argv('git', 'fetch')
    expect(fetches[0]!.join(' ')).toContain('pull/12/head:')
    // Merge base in, no commit/push during resolve.
    expect(script.argv('git', 'merge').filter((a) => a[1] !== '--abort')[0]).toEqual([
      '-c',
      'rerere.enabled=false',
      'merge',
      'origin/main',
      '--no-edit'
    ])
    expect(script.argv('git', 'commit')).toHaveLength(0)
    expect(script.argv('git', 'push')).toHaveLength(0)
  })

  it('refuses when the PR is not conflicting', async () => {
    const script = new Script([
      { match: (c) => c === 'gh', stdout: JSON.stringify({ mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN', baseRefName: 'main' }) }
    ])
    const p = providerWith(script)
    const out = await toolsOf(p)['github_resolve_conflicts']!.execute({ repo: 'acme/widget', pr: 5 } as never)
    expect(String(out)).toMatch(/not conflicting/i)
    expect(script.argv('git', 'checkout')).toHaveLength(0)
  })

  it('refuses dirty worktrees and unknown repos', async () => {
    const dirty = new Script([
      { match: (c, a) => c === 'gh' && a[0] === 'pr', stdout: PR_VIEW },
      { match: (c, a) => c === 'gh' && a[0] === 'repo', stdout: REPO_VIEW },
      { match: (c) => c === 'git', stdout: ' M dirty.ts\n' }
    ])
    const out = await toolsOf(providerWith(dirty))['github_resolve_conflicts']!.execute({ repo: 'acme/widget', pr: 12 } as never)
    expect(String(out)).toMatch(/dirty/i)
    const p = providerWith(resolveScript())
    expect(String(await toolsOf(p)['github_resolve_conflicts']!.execute({ repo: 'evil/x', pr: 1 } as never))).toMatch(/not in the configured/i)
  })

  it('reports unresolvable files and commits nothing', async () => {
    const script = resolveScript()
    const p = providerWith(script, REPOS, async () => ({
      summary: 'stuck',
      resolved: ['a.ts'],
      unresolved: [{ file: 'b.ts', reason: 'semantic conflict needs human' }]
    }))
    const out = await toolsOf(p)['github_resolve_conflicts']!.execute({ repo: 'acme/widget', pr: 12 } as never)
    expect(String(out)).toMatch(/could not resolve/i)
    expect(String(out)).toMatch(/b\.ts/)
    expect(String(out)).toMatch(/semantic conflict/)
    expect(script.argv('git', 'commit')).toHaveLength(0)
  })

  it('abort stops the flow and aborts the merge', async () => {
    const script = resolveScript()
    const p = providerWith(script)
    const controller = new AbortController()
    controller.abort()
    const out = await runWithContext({ runId: 'r', source: 'palette', signal: controller.signal }, () =>
      toolsOf(p)['github_resolve_conflicts']!.execute({ repo: 'acme/widget', pr: 12 } as never)
    )
    expect(String(out)).toMatch(/aborted/i)
    expect(script.argv('git', 'merge').some((a) => a[1] === '--abort')).toBe(true)
  })
})

describe('commit flow (branch safety)', () => {
  function commitScript(head: string, porcelain: string): Script {
    return new Script([
      { match: (c) => c === 'gh', stdout: REPO_VIEW },
      { match: (c, a) => c === 'git' && a[0] === 'rev-parse' && a[1] === '--abbrev-ref', stdout: `${head}\n` },
      { match: (c, a) => c === 'git' && a[0] === 'status', stdout: porcelain },
      { match: (c, a) => c === 'git' && a[0] === 'add', stdout: '' },
      { match: (c, a) => c === 'git' && a[0] === 'commit', stdout: '' },
      { match: (c, a) => c === 'git' && a[0] === 'rev-parse', stdout: 'abc123\n' }
    ])
  }

  it('commits on the resolve branch with plain add + commit', async () => {
    const script = commitScript('palette/resolve-pr-12-xyz', ' M a.ts\n')
    const p = providerWith(script)
    const out = (await toolsOf(p)['github_commit_resolution']!.execute({
      repo: 'acme/widget',
      branch: 'palette/resolve-pr-12-xyz',
      message: 'Resolve conflicts'
    } as never)) as { committed: boolean; hash: string }
    expect(out.committed).toBe(true)
    expect(out.hash).toBe('abc123')
    expect(script.argv('git', 'commit')[0]).toEqual(['commit', '-m', 'Resolve conflicts'])
    const allFlags = script.calls.flatMap((c) => c.args)
    expect(allFlags).not.toContain('--amend')
    expect(allFlags).not.toContain('--force')
  })

  it('refuses the default branch, foreign branches, wrong checkout, clean tree', async () => {
    const p = providerWith(commitScript('palette/resolve-pr-12-xyz', ' M a.ts\n'))
    const tools = toolsOf(p)
    expect(String(await tools['github_commit_resolution']!.execute({ repo: 'acme/widget', branch: 'main', message: 'x' } as never))).toMatch(/never.*default branch/i)
    expect(String(await tools['github_commit_resolution']!.execute({ repo: 'acme/widget', branch: 'feature', message: 'x' } as never))).toMatch(/only palette\/resolve-pr/i)
    expect(
      String(
        await tools['github_commit_resolution']!.execute({ repo: 'acme/widget', branch: 'palette/resolve-pr-12-other', message: 'x' } as never)
      )
    ).toMatch(/not checked out/i)
    const clean = providerWith(commitScript('palette/resolve-pr-12-xyz', ''))
    expect(
      String(
        await toolsOf(clean)['github_commit_resolution']!.execute({ repo: 'acme/widget', branch: 'palette/resolve-pr-12-xyz', message: 'x' } as never)
      )
    ).toMatch(/nothing to commit/i)
  })
})

describe('push flow (separate approval, never force)', () => {
  it('pushes only palette/resolve-pr-* with plain push', async () => {
    const script = new Script([
      { match: (c) => c === 'gh', stdout: REPO_VIEW },
      { match: (c, a) => c === 'git' && a[0] === 'push', stdout: '' }
    ])
    const p = providerWith(script)
    const out = (await toolsOf(p)['github_push_resolution']!.execute({
      repo: 'acme/widget',
      branch: 'palette/resolve-pr-12-xyz'
    } as never)) as { pushed: boolean }
    expect(out.pushed).toBe(true)
    expect(script.argv('git', 'push')[0]).toEqual(['push', 'origin', 'palette/resolve-pr-12-xyz'])
    const flags = script.calls.flatMap((c) => c.args)
    expect(flags).not.toContain('--force')
    expect(flags).not.toContain('-f')
    expect(flags).not.toContain('--delete')
  })

  it('refuses default branch and foreign branches', async () => {
    const script = new Script([{ match: (c) => c === 'gh', stdout: REPO_VIEW }])
    const p = providerWith(script)
    const tools = toolsOf(p)
    expect(String(await tools['github_push_resolution']!.execute({ repo: 'acme/widget', branch: 'main' } as never))).toMatch(/never.*default branch/i)
    expect(String(await tools['github_push_resolution']!.execute({ repo: 'acme/widget', branch: 'feature' } as never))).toMatch(/only palette\/resolve-pr/i)
    expect(script.argv('git', 'push')).toHaveLength(0)
  })
})

describe('resolveBranchName', () => {
  it('is unique per run and never a default branch', () => {
    const a = resolveBranchName(12, 1000)
    const b = resolveBranchName(12, 2000)
    expect(a).not.toBe(b)
    for (const n of [a, b]) {
      expect(n.startsWith('palette/resolve-pr-12-')).toBe(true)
      expect(['main', 'master']).not.toContain(n)
    }
  })
})

describe('classifyOpencodePermission', () => {
  const P = (type: string, pattern?: string | string[]) => ({ type, pattern })
  it('allows reads, asks edits, denies network', () => {
    expect(classifyOpencodePermission(P('read'))).toBe('allow')
    expect(classifyOpencodePermission(P('glob'))).toBe('allow')
    expect(classifyOpencodePermission(P('grep'))).toBe('allow')
    expect(classifyOpencodePermission(P('edit', 'a.ts'))).toBe('ask')
    expect(classifyOpencodePermission(P('webfetch'))).toBe('deny')
    expect(classifyOpencodePermission(P('websearch'))).toBe('deny')
    expect(classifyOpencodePermission(P('mystery'))).toBe('ask')
  })

  it('allows the configured test command and read-only git, asks the rest', () => {
    expect(classifyOpencodePermission(P('bash', 'npm test'), { testCommand: 'npm test' })).toBe('allow')
    expect(classifyOpencodePermission(P('bash', 'npm test -- --run a'), { testCommand: 'npm test' })).toBe('allow')
    expect(classifyOpencodePermission(P('bash', 'git status'), {})).toBe('allow')
    expect(classifyOpencodePermission(P('bash', 'git diff --stat'), {})).toBe('allow')
    expect(classifyOpencodePermission(P('bash', 'rm -rf /'), { testCommand: 'npm test' })).toBe('ask')
    expect(classifyOpencodePermission(P('bash', 'git push origin x'), {})).toBe('ask')
    expect(classifyOpencodePermission(P('bash'), {})).toBe('ask')
  })
})

describe('parseResolveOutcome', () => {
  it('parses the trailing JSON object', () => {
    const text = 'some prose\n{"resolved": ["a"], "unresolved": [{"file": "b", "reason": "hard"}]}'
    expect(parseResolveOutcome(text)).toEqual({
      resolved: ['a'],
      unresolved: [{ file: 'b', reason: 'hard' }]
    })
  })

  it('returns empty on garbage', () => {
    expect(parseResolveOutcome('no json here')).toEqual({ resolved: [], unresolved: [] })
  })
})

describe('runOpencodeResolve', () => {
  function fakeClient() {
    const posted: unknown[] = []
    return {
      posted,
      abortCalled: { value: false },
      client: {
        session: {
          // hey-api 'fields' style: { data, request, response }, no error key.
          create: async () => ({ data: { id: 's1' }, request: {}, response: {} }),
          prompt: async () => ({
            data: { parts: [{ type: 'text', text: 'done\n{"resolved": ["a"], "unresolved": []}' }] },
            request: {},
            response: {}
          }),
          abort: async () => {
            return true
          }
        },
        event: {
          subscribe: async () => ({
            stream: (async function* () {
              yield {
                type: 'permission.updated',
                properties: { id: 'p1', type: 'edit', title: 'Edit a.ts', sessionID: 's1', metadata: {} }
              }
            })()
          })
        },
        postSessionIdPermissionsPermissionId: async (args: unknown) => {
          posted.push(args)
          return true
        }
      }
    }
  }

  it('maps an approved permission to once', async () => {
    const f = fakeClient()
    const out = await runOpencodeResolve({
      client: f.client as never,
      directory: '/tmp/x',
      prompt: 'resolve',
      onPermission: async () => true
    })
    expect(out.resolved).toEqual(['a'])
    expect(f.posted).toHaveLength(1)
    expect(JSON.stringify(f.posted[0])).toContain('"once"')
  })

  it('maps a denied permission to reject', async () => {
    const f = fakeClient()
    await runOpencodeResolve({
      client: f.client as never,
      directory: '/tmp/x',
      prompt: 'resolve',
      onPermission: async () => false
    })
    expect(JSON.stringify(f.posted[0])).toContain('"reject"')
  })

  it('aborts the session when the signal is already aborted', async () => {
    let aborted = false
    const f = fakeClient()
    const controller = new AbortController()
    controller.abort()
    await expect(
      runOpencodeResolve({
        client: {
          ...f.client,
          session: {
            ...f.client.session,
            abort: async () => {
              aborted = true
              return true
            }
          }
        } as never,
        directory: '/tmp/x',
        prompt: 'resolve',
        signal: controller.signal,
        onPermission: async () => true
      })
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(aborted).toBe(true)
  })
})

describe('nested approval bridge', () => {
  it('denies when no handler is wired', async () => {
    const d = await requestNestedApprovalForCurrentRun({ toolName: 'opencode: edit', input: {} })
    expect(d.approved).toBe(false)
  })

  it('forwards to the wired handler with the run id', async () => {
    const seen: string[] = []
    setNestedApprovalHandler(async (req) => {
      seen.push(`${req.runId}:${req.toolName}`)
      return { approved: true }
    })
    const d = await runWithContext({ runId: 'run-9', source: 'palette' }, () =>
      requestNestedApprovalForCurrentRun({ toolName: 'opencode: edit x', input: { a: 1 } })
    )
    expect(d.approved).toBe(true)
    expect(seen).toEqual(['run-9:opencode: edit x'])
  })
})

describe('OpencodeServerManager', () => {
  class FakeChild extends EventEmitter {
    killed: string[] = []
    exitCode: number | null = null
    stderr = { on(): void {} }
    kill(signal?: string): boolean {
      this.killed.push(signal ?? '')
      // Real processes exit asynchronously after SIGTERM.
      queueMicrotask(() => this.emit('exit', 0))
      return true
    }
  }

  it('starts once for concurrent callers and stops by killing the child', async () => {
    const child = new FakeChild()
    let spawns = 0
    const mgr = new OpencodeServerManager({
      pickPort: async () => 45678,
      spawnFn: (() => {
        spawns++
        return child
      }) as unknown as ServerManagerDeps['spawnFn'],
      pollHealth: async () => true,
      createClient: () => ({}) as never
    })
    const [a, b] = await Promise.all([mgr.start(), mgr.start()])
    expect(a).toBe('http://127.0.0.1:45678')
    expect(b).toBe(a)
    expect(spawns).toBe(1)
    expect(mgr.running).toBe(true)
    await mgr.stop()
    expect(child.killed).toEqual(['SIGTERM'])
    expect(mgr.running).toBe(false)
  })

  it('reports a missing binary clearly', async () => {
    const mgr = new OpencodeServerManager({
      pickPort: async () => 45679,
      spawnFn: () => {
        const err = new Error('spawn opencode ENOENT') as NodeJS.ErrnoException
        err.code = 'ENOENT'
        const emitter = new EventEmitter()
        queueMicrotask(() => emitter.emit('error', err))
        return emitter as never
      },
      // Health answers slowly so the spawn error wins the race, as in reality.
      pollHealth: async () => {
        await new Promise((r) => setTimeout(r, 25))
        return true
      }
    })
    await expect(mgr.start()).rejects.toThrow(/not found on PATH/i)
  })
})
