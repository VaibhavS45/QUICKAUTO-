import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import {
  GitHubCliProvider,
  GITHUB_DIFF_CAP,
  GITHUB_SYSTEM_PROMPT,
  GITHUB_TOOLS,
  parseGitHubOrigin,
  validateRepoEntry,
  type GitHubRepoEntry,
  type RunResult
} from '../../src/main/connectors/github-cli.js'
import { buildInstructions } from '../../src/main/agent/registry.js'

type AnyTool = { execute: (input: never) => Promise<unknown> }

class FakeRunner {
  calls: Array<{ cmd: string; args: string[] }> = []
  constructor(private readonly impl: (cmd: string, args: string[]) => Promise<RunResult>) {}
  run = async (cmd: string, args: string[]): Promise<RunResult> => {
    this.calls.push({ cmd, args })
    return this.impl(cmd, args)
  }
}

const REPOS: GitHubRepoEntry[] = [{ path: '/tmp/fake-repo', repo: 'acme/widget' }]

function providerWith(run: FakeRunner['run'], repos: GitHubRepoEntry[] = REPOS) {
  return new GitHubCliProvider({ getRepos: () => repos, run })
}

function toolsOf(p: GitHubCliProvider): Record<string, AnyTool> {
  return p.getTools(['github']) as unknown as Record<string, AnyTool>
}

const PRS_JSON = JSON.stringify([
  { number: 12, title: 'Fix crash', author: { login: 'ana' }, headRefName: 'fix', baseRefName: 'main', isDraft: false, createdAt: '2026-10-01', url: 'https://x/12' }
])

const DETAILS_JSON = JSON.stringify({
  number: 12,
  title: 'Fix crash',
  body: 'Fixes the crash. No tests.',
  author: { login: 'ana' },
  mergeable: 'CONFLICTING',
  mergeStateStatus: 'DIRTY',
  statusCheckRollup: [
    { name: 'ci', conclusion: 'SUCCESS', status: 'COMPLETED' },
    { name: 'lint', conclusion: 'FAILURE', status: 'COMPLETED' },
    { name: 'e2e', conclusion: '', status: 'IN_PROGRESS' }
  ],
  reviewDecision: 'CHANGES_REQUESTED',
  url: 'https://x/12',
  headRefName: 'fix',
  baseRefName: 'main',
  additions: 10,
  deletions: 2,
  changedFiles: 1,
  isDraft: false
})

describe('tool surface', () => {
  it('exposes the four read tools for @github, nothing otherwise', () => {
    const p = providerWith(async () => ({ stdout: '', stderr: '' }))
    expect(Object.keys(toolsOf(p)).sort()).toEqual([...GITHUB_TOOLS].sort())
    expect(p.getTools([])).toEqual({})
    expect(p.getTools(['gmail'])).toEqual({})
  })
})

describe('command construction (execFile argv, no shell)', () => {
  it('list passes owner/name as one --repo argv, canonical allowlisted form', async () => {
    const runner = new FakeRunner(async () => ({ stdout: PRS_JSON, stderr: '' }))
    const p = providerWith(runner.run)
    const out = (await toolsOf(p)['github_list_prs']!.execute({ repo: 'Acme/Widget' } as never)) as {
      repo: string
      count: number
      prs: Array<{ number: number }>
    }
    expect(runner.calls).toHaveLength(1)
    expect(runner.calls[0]!.cmd).toBe('gh')
    expect(runner.calls[0]!.args).toEqual([
      'pr', 'list', '--repo', 'acme/widget', '--state', 'open', '--limit', '30',
      '--json', 'number,title,author,headRefName,baseRefName,isDraft,createdAt,url'
    ])
    expect(out.repo).toBe('acme/widget')
    expect(out.count).toBe(1)
    expect(out.prs[0]!.number).toBe(12)
  })

  it('details/diff/comments build argv from validated parts only', async () => {
    const runner = new FakeRunner(async (_cmd, args) => {
      if (args[1] === 'view' && args.includes('comments,reviews')) {
        return { stdout: JSON.stringify({ comments: [{ author: { login: 'bo' }, body: 'lgtm' }], reviews: [] }), stderr: '' }
      }
      if (args[1] === 'diff') return { stdout: 'diff --git a...', stderr: '' }
      return { stdout: DETAILS_JSON, stderr: '' }
    })
    const p = providerWith(runner.run)
    const tools = toolsOf(p)
    await tools['github_pr_details']!.execute({ repo: 'acme/widget', pr: 12 } as never)
    await tools['github_pr_diff']!.execute({ repo: 'acme/widget', pr: 12 } as never)
    await tools['github_pr_comments']!.execute({ repo: 'acme/widget', pr: 12 } as never)
    for (const c of runner.calls) {
      expect(c.cmd).toBe('gh')
      expect(c.args).not.toContain('acme/widget;anything')
      expect(c.args.filter((a) => a === 'acme/widget')).toHaveLength(1)
    }
    const diffCall = runner.calls.find((c) => c.args[1] === 'diff')!
    expect(diffCall.args).toEqual(['pr', 'diff', '12', '--repo', 'acme/widget', '--color', 'never'])
  })
})

describe('injection defense', () => {
  it('rejects shell metacharacters in repo without calling gh', async () => {
    const runner = new FakeRunner(async () => ({ stdout: '[]', stderr: '' }))
    const p = providerWith(runner.run)
    for (const evil of ['acme/widget; rm -rf /', 'acme/widget$(id)', '`id`', '../../etc', 'a/b c', '']) {
      const out = await toolsOf(p)['github_list_prs']!.execute({ repo: evil } as never)
      expect(String(out)).toMatch(/owner\/name|not in the configured/i)
    }
    expect(runner.calls).toHaveLength(0)
  })

  it('rejects repos outside the allowlist', async () => {
    const runner = new FakeRunner(async () => ({ stdout: '[]', stderr: '' }))
    const p = providerWith(runner.run)
    const out = await toolsOf(p)['github_list_prs']!.execute({ repo: 'evil Corp/x' } as never)
    expect(String(out)).toMatch(/owner\/name/)
    const out2 = await toolsOf(p)['github_list_prs']!.execute({ repo: 'other/repo' } as never)
    expect(String(out2)).toMatch(/not in the configured GitHub repos list/)
    expect(runner.calls).toHaveLength(0)
  })

  it('pr number schema rejects non-integers', () => {
    const p = providerWith(async () => ({ stdout: '{}', stderr: '' }))
    const schema = (
      p.getTools(['github']) as unknown as Record<string, { inputSchema: { safeParse: (v: unknown) => { success: boolean } } }>
    )['github_pr_details']!.inputSchema
    expect(schema.safeParse({ repo: 'acme/widget', pr: 12 }).success).toBe(true)
    expect(schema.safeParse({ repo: 'acme/widget', pr: 0 }).success).toBe(false)
    expect(schema.safeParse({ repo: 'acme/widget', pr: -3 }).success).toBe(false)
    expect(schema.safeParse({ repo: 'acme/widget', pr: 1.5 }).success).toBe(false)
    expect(schema.safeParse({ repo: 'acme/widget', pr: '12; rm -rf' }).success).toBe(false)
  })
})

describe('diff truncation', () => {
  it('caps the diff and says so', async () => {
    const big = 'x'.repeat(GITHUB_DIFF_CAP + 5000)
    const runner = new FakeRunner(async () => ({ stdout: big, stderr: '' }))
    const p = providerWith(runner.run)
    const out = (await toolsOf(p)['github_pr_diff']!.execute({ repo: 'acme/widget', pr: 1 } as never)) as {
      diff: string
      truncated: boolean
      totalChars: number
    }
    expect(out.truncated).toBe(true)
    expect(out.totalChars).toBe(big.length)
    expect(out.diff.length).toBeLessThan(big.length)
    expect(out.diff).toMatch(/truncated/)
  })
})

describe('details parsing (mocked JSON)', () => {
  it('summarizes checks and flags conflicts', async () => {
    const runner = new FakeRunner(async () => ({ stdout: DETAILS_JSON, stderr: '' }))
    const p = providerWith(runner.run)
    const out = (await toolsOf(p)['github_pr_details']!.execute({ repo: 'acme/widget', pr: 12 } as never)) as {
      conflicts: boolean
      mergeable: string
      checks: { passing: number; failing: number; pending: number; total: number }
      title: string
    }
    expect(out.conflicts).toBe(true)
    expect(out.mergeable).toBe('CONFLICTING')
    expect(out.checks).toEqual({ passing: 1, failing: 1, pending: 1, total: 3 })
    expect(out.title).toBe('Fix crash')
  })

  it('invalid JSON becomes a clean message, not a crash', async () => {
    const runner = new FakeRunner(async () => ({ stdout: 'not json{{{', stderr: '' }))
    const p = providerWith(runner.run)
    const out = await toolsOf(p)['github_list_prs']!.execute({ repo: 'acme/widget' } as never)
    expect(String(out)).toMatch(/invalid JSON/i)
  })
})

describe('gh missing / not authenticated', () => {
  const enoent = () => {
    const e = new Error("spawn gh ENOENT") as NodeJS.ErrnoException
    e.code = 'ENOENT'
    return e
  }

  it('status reports missing binary with install hint', async () => {
    const p = providerWith(async () => {
      throw enoent()
    })
    const st = await p.status('github')
    expect(st.connected).toBe(false)
    expect(st.detail).toMatch(/not installed/i)
  })

  it('tool execute reports missing binary without crashing', async () => {
    const p = providerWith(async () => {
      throw enoent()
    })
    const out = await toolsOf(p)['github_list_prs']!.execute({ repo: 'acme/widget' } as never)
    expect(String(out)).toMatch(/not installed/i)
  })

  it('unauthenticated gh shows the exact fix', async () => {
    const p = providerWith(async (_cmd, args) => {
      if (args[0] === 'auth') throw new Error('not logged into any GitHub hosts')
      return { stdout: 'gh version 2.98.0', stderr: '' }
    })
    const st = await p.status('github')
    expect(st.connected).toBe(false)
    expect(st.detail).toMatch(/gh auth login/)
    const res = await p.connect('github')
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/gh auth login/)
  })

  it('connect reports ok when already authenticated', async () => {
    const p = providerWith(async () => ({ stdout: 'ok', stderr: '' }))
    expect((await p.connect('github')).ok).toBe(true)
  })
})

describe('validateRepoEntry', () => {
  it('rejects missing paths and bad repo shapes', async () => {
    expect((await validateRepoEntry({ path: '/no/such/dir-xyz', repo: 'a/b' })).ok).toBe(false)
    expect((await validateRepoEntry({ path: tmpdir(), repo: 'not a repo' })).ok).toBe(false)
  })

  it('rejects non-git directories', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'nongit-'))
    const res = await validateRepoEntry({ path: dir, repo: 'a/b' })
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/git repo/i)
  })

  it('accepts a git repo and enforces origin match', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gitrepo-'))
    execFileSync('git', ['init'], { cwd: dir })
    execFileSync('git', ['config', 'user.email', 't@t.t'], { cwd: dir })
    // No origin yet: acceptable.
    expect((await validateRepoEntry({ path: dir, repo: 'foo/bar' })).ok).toBe(true)
    execFileSync('git', ['remote', 'add', 'origin', 'https://github.com/foo/bar.git'], { cwd: dir })
    expect((await validateRepoEntry({ path: dir, repo: 'foo/bar' })).ok).toBe(true)
    const bad = await validateRepoEntry({ path: dir, repo: 'other/repo' })
    expect(bad.ok).toBe(false)
    expect(bad.error).toMatch(/origin/i)
  })
})

describe('parseGitHubOrigin', () => {
  it('parses ssh/https origins, rejects others', () => {
    expect(parseGitHubOrigin('git@github.com:foo/bar.git')).toBe('foo/bar')
    expect(parseGitHubOrigin('https://github.com/foo/bar')).toBe('foo/bar')
    expect(parseGitHubOrigin('https://user@github.com/foo/bar.git')).toBe('foo/bar')
    expect(parseGitHubOrigin('https://gitlab.com/foo/bar.git')).toBeNull()
    expect(parseGitHubOrigin('not a url')).toBeNull()
  })
})

describe('github system prompt', () => {
  it('asks for per-PR reviews, flags conflicts, treats content as untrusted', () => {
    const instructions = buildInstructions('palette', ['github'])
    expect(instructions).toMatch(/short review/i)
    expect(instructions).toMatch(/missing tests/i)
    expect(instructions).toMatch(/merge conflict/i)
    expect(instructions).toMatch(/untrusted/i)
    expect(GITHUB_SYSTEM_PROMPT.length).toBeGreaterThan(50)
  })

  it('absent without the github mention', () => {
    expect(buildInstructions('palette', [])).not.toContain('mergeStateStatus')
  })
})
