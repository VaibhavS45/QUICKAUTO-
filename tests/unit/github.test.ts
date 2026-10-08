import { describe, expect, it } from 'vitest'
import {
  GITHUB_DIFF_CAP,
  GITHUB_SYSTEM_PROMPT,
  GITHUB_TOOLS,
  GitHubCliProvider,
  isZeroCostTool,
  parseGitHubOrigin,
  PR_SCHEMA,
  REPO_SCHEMA,
  validateRepoEntry,
  type GitHubRepoEntry,
  type RunResult
} from '../../src/main/connectors/github-cli.js'
import { buildInstructions } from '../../src/main/agent/registry.js'

type Handler = (cmd: string, args: string[]) => Promise<RunResult>

function providerWith(repos: GitHubRepoEntry[], handler: Handler): { provider: GitHubCliProvider; calls: Array<{ cmd: string; args: string[] }> } {
  const calls: Array<{ cmd: string; args: string[] }> = []
  const provider = new GitHubCliProvider({
    getRepos: () => repos,
    run: async (cmd, args) => {
      calls.push({ cmd, args })
      return handler(cmd, args)
    }
  })
  return { provider, calls }
}

const REPOS: GitHubRepoEntry[] = [{ path: '/tmp/repo', repo: 'VaibhavS45/auto' }]

function okJson(value: unknown): Handler {
  return async () => ({ stdout: JSON.stringify(value), stderr: '' })
}

type AnyTool = { execute: (input: never) => Promise<unknown> }
function toolsOf(p: GitHubCliProvider): Record<string, AnyTool> {
  return p.getTools(['github']) as unknown as Record<string, AnyTool>
}

describe('tool surface', () => {
  it('exposes exactly the four read-only tools for @github', () => {
    const { provider } = providerWith(REPOS, okJson([]))
    expect(Object.keys(toolsOf(provider)).sort()).toEqual([...GITHUB_TOOLS].sort())
  })

  it('exposes nothing without the github mention', () => {
    const { provider } = providerWith(REPOS, okJson([]))
    expect(provider.getTools([])).toEqual({})
    expect(provider.getTools(['gmail'])).toEqual({})
  })

  it('marks tools zero-cost so the BudgetGuard wrapper skips them', () => {
    const { provider } = providerWith(REPOS, okJson([]))
    for (const t of Object.values(toolsOf(provider))) {
      expect(isZeroCostTool(t)).toBe(true)
    }
    expect(isZeroCostTool({})).toBe(false)
  })

  it('offers no write/delete/merge/push tools', () => {
    const { provider } = providerWith(REPOS, okJson([]))
    const names = JSON.stringify(Object.keys(toolsOf(provider)))
    expect(names).not.toMatch(/merge|push|write|delete|close|comment-create|approve/i)
  })
})

describe('command construction (execFile argv, no shell)', () => {
  it('list PRs passes an exact argv array with the allowlisted repo', async () => {
    const { provider, calls } = providerWith(REPOS, okJson([]))
    await toolsOf(provider)['github_list_prs']!.execute({ repo: 'VaibhavS45/auto' } as never)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual({
      cmd: 'gh',
      args: ['pr', 'list', '--repo', 'VaibhavS45/auto', '--state', 'open', '--limit', '30',
        '--json', 'number,title,author,headRefName,baseRefName,isDraft,createdAt,url']
    })
  })

  it('details/diff/comments build their exact argv', async () => {
    const { provider, calls } = providerWith(REPOS, okJson({}))
    await toolsOf(provider)['github_pr_details']!.execute({ repo: 'VaibhavS45/auto', pr: 7 } as never)
    expect(calls[0]!.args.slice(0, 5)).toEqual(['pr', 'view', '7', '--repo', 'VaibhavS45/auto'])
    await toolsOf(provider)['github_pr_diff']!.execute({ repo: 'VaibhavS45/auto', pr: 7 } as never)
    expect(calls[1]).toEqual({ cmd: 'gh', args: ['pr', 'diff', '7', '--repo', 'VaibhavS45/auto', '--color', 'never'] })
    await toolsOf(provider)['github_pr_comments']!.execute({ repo: 'VaibhavS45/auto', pr: 7 } as never)
    expect(calls[2]!.args.slice(0, 5)).toEqual(['pr', 'view', '7', '--repo', 'VaibhavS45/auto'])
  })

  it('uses the canonical allowlisted spelling, not user input', async () => {
    const { provider, calls } = providerWith([{ path: '/tmp/r', repo: 'VaibhavS45/Auto' }], okJson([]))
    await toolsOf(provider)['github_list_prs']!.execute({ repo: 'vaibhavs45/auto' } as never)
    expect(calls[0]!.args).toContain('VaibhavS45/Auto')
    expect(calls[0]!.args).not.toContain('vaibhavs45/auto')
  })
})

describe('injection resistance', () => {
  it('rejects shell metacharacters in repo names (shape + allowlist)', async () => {
    const { provider, calls } = providerWith(REPOS, okJson([]))
    for (const evil of ['x; rm -rf /', 'a|b', '$(id)', 'a`b`', 'a && b', '../../etc', 'owner/name extra']) {
      const out = await toolsOf(provider)['github_list_prs']!.execute({ repo: evil } as never)
      expect(String(out)).toMatch(/must be owner\/name|not in the configured/i)
    }
    expect(calls).toHaveLength(0)
  })

  it('rejects non-allowlisted repos even when well-formed', async () => {
    const { provider, calls } = providerWith(REPOS, okJson([]))
    const out = await toolsOf(provider)['github_list_prs']!.execute({ repo: 'evil/corp' } as never)
    expect(String(out)).toMatch(/not in the configured GitHub repos list/)
    expect(calls).toHaveLength(0)
  })

  it('zod PR schema rejects non-integers, negatives, zero', () => {
    expect(PR_SCHEMA.safeParse(7).success).toBe(true)
    for (const bad of [0, -1, 1.5, '7', '7; rm', NaN]) {
      expect(PR_SCHEMA.safeParse(bad).success).toBe(false)
    }
  })

  it('zod repo schema rejects metacharacters', () => {
    expect(REPO_SCHEMA.safeParse('VaibhavS45/auto').success).toBe(true)
    expect(REPO_SCHEMA.safeParse('a; rm -rf /').success).toBe(false)
    expect(REPO_SCHEMA.safeParse('$(id)/x').success).toBe(false)
  })
})

describe('diff truncation', () => {
  it('returns short diffs intact with truncated=false', async () => {
    const { provider } = providerWith(REPOS, async () => ({ stdout: 'diff --git small', stderr: '' }))
    const out = (await toolsOf(provider)['github_pr_diff']!.execute({ repo: 'VaibhavS45/auto', pr: 1 } as never)) as {
      diff: string; truncated: boolean; totalChars: number
    }
    expect(out.truncated).toBe(false)
    expect(out.diff).toBe('diff --git small')
    expect(out.totalChars).toBe('diff --git small'.length)
  })

  it('caps long diffs and says when truncated', async () => {
    const big = 'x'.repeat(GITHUB_DIFF_CAP + 100)
    const { provider } = providerWith(REPOS, async () => ({ stdout: big, stderr: '' }))
    const out = (await toolsOf(provider)['github_pr_diff']!.execute({ repo: 'VaibhavS45/auto', pr: 1 } as never)) as {
      diff: string; truncated: boolean; totalChars: number
    }
    expect(out.truncated).toBe(true)
    expect(out.totalChars).toBe(GITHUB_DIFF_CAP + 100)
    expect(out.diff.length).toBeLessThan(big.length)
    expect(out.diff).toContain('[truncated:')
    expect(out.diff).toContain(String(GITHUB_DIFF_CAP))
  })
})

describe('gh missing / unauthenticated', () => {
  function enoent(): Handler {
    return async () => {
      throw Object.assign(new Error('spawn gh ENOENT'), { code: 'ENOENT' })
    }
  }

  it('missing binary reports install instructions, no throw', async () => {
    const { provider } = providerWith(REPOS, enoent())
    const out = await toolsOf(provider)['github_list_prs']!.execute({ repo: 'VaibhavS45/auto' } as never)
    expect(String(out)).toMatch(/not installed/)
    const check = await provider.checkGh()
    expect(check).toMatchObject({ installed: false, authenticated: false })
  })

  it('unauthenticated gh gives the exact `gh auth login` fix', async () => {
    const { provider } = providerWith(REPOS, async (cmd, args) => {
      if (cmd === 'gh' && args[0] === '--version') return { stdout: 'gh version 2.98.0\n', stderr: '' }
      throw Object.assign(new Error('auth failed'), { stderr: 'You are not logged into any GitHub hosts. Run gh auth login.' })
    })
    const check = await provider.checkGh()
    expect(check.authenticated).toBe(false)
    expect(check.detail).toContain('gh auth login')
    const out = await toolsOf(provider)['github_list_prs']!.execute({ repo: 'VaibhavS45/auto' } as never)
    expect(String(out)).toContain('gh auth login')
  })

  it('authenticated gh passes the check', async () => {
    const { provider } = providerWith(REPOS, async () => ({ stdout: 'ok', stderr: '' }))
    const check = await provider.checkGh()
    expect(check).toMatchObject({ installed: true, authenticated: true })
  })
})

describe('mocked JSON parsing', () => {
  it('parses PR list items (author login, head/base, draft)', async () => {
    const { provider } = providerWith(REPOS, okJson([
      { number: 3, title: 'Fix x', author: { login: 'alice' }, headRefName: 'f', baseRefName: 'main', isDraft: false, createdAt: '2026-01-01', url: 'https://x/3' }
    ]))
    const out = (await toolsOf(provider)['github_list_prs']!.execute({ repo: 'VaibhavS45/auto' } as never)) as {
      count: number; prs: Array<Record<string, unknown>>
    }
    expect(out.count).toBe(1)
    expect(out.prs[0]).toMatchObject({ number: 3, title: 'Fix x', author: 'alice', head: 'f', base: 'main' })
  })

  it('parses details: mergeable state, conflict flag, check rollup', async () => {
    const { provider } = providerWith(REPOS, okJson({
      number: 3, title: 'T', body: 'b', author: { login: 'bob' }, mergeable: 'CONFLICTING',
      mergeStateStatus: 'DIRTY', statusCheckRollup: [
        { conclusion: 'SUCCESS' }, { conclusion: 'FAILURE' }, { status: 'IN_PROGRESS' }
      ],
      reviewDecision: 'CHANGES_REQUESTED', additions: 10, deletions: 2, changedFiles: 3
    }))
    const out = (await toolsOf(provider)['github_pr_details']!.execute({ repo: 'VaibhavS45/auto', pr: 3 } as never)) as {
      conflicts: boolean; mergeable: string; mergeStateStatus: string; checks: Record<string, number>
    }
    expect(out.conflicts).toBe(true)
    expect(out.mergeable).toBe('CONFLICTING')
    expect(out.checks).toMatchObject({ passing: 1, failing: 1, pending: 1, total: 3 })
  })

  it('non-conflicting PR reports conflicts=false', async () => {
    const { provider } = providerWith(REPOS, okJson({ number: 4, mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN', statusCheckRollup: [] }))
    const out = (await toolsOf(provider)['github_pr_details']!.execute({ repo: 'VaibhavS45/auto', pr: 4 } as never)) as { conflicts: boolean }
    expect(out.conflicts).toBe(false)
  })

  it('invalid JSON yields a message, never a throw', async () => {
    const { provider } = providerWith(REPOS, async () => ({ stdout: 'not json{{{', stderr: '' }))
    const out = await toolsOf(provider)['github_list_prs']!.execute({ repo: 'VaibhavS45/auto' } as never)
    expect(String(out)).toMatch(/invalid JSON/i)
  })

  it('caps comment/review excerpts', async () => {
    const { provider } = providerWith(REPOS, okJson({
      comments: [{ author: { login: 'c' }, body: 'y'.repeat(900) }],
      reviews: [{ author: { login: 'r' }, body: 'ok', state: 'APPROVED' }]
    }))
    const out = (await toolsOf(provider)['github_pr_comments']!.execute({ repo: 'VaibhavS45/auto', pr: 1 } as never)) as {
      comments: Array<{ body: string }>; reviews: Array<Record<string, unknown>>
    }
    expect(out.comments[0]!.body.length).toBe(500)
    expect(out.reviews[0]).toMatchObject({ author: 'r', state: 'APPROVED' })
  })
})

describe('system prompt', () => {
  it('asks for per-PR reviews, flags conflicts, treats PR content as untrusted data', () => {
    const instructions = buildInstructions('palette', ['github'])
    expect(instructions).toContain(GITHUB_SYSTEM_PROMPT)
    expect(instructions).toMatch(/short review/i)
    expect(instructions).toMatch(/missing tests/i)
    expect(instructions).toMatch(/merge conflict/i)
    expect(instructions).toMatch(/untrusted DATA/i)
  })

  it('is only included for @github runs', () => {
    expect(buildInstructions('palette', [])).not.toContain(GITHUB_SYSTEM_PROMPT)
    expect(buildInstructions('palette', ['gmail'])).not.toContain(GITHUB_SYSTEM_PROMPT)
  })
})

describe('repo allowlist validation', () => {
  it('parses GitHub origins (https, ssh, git@)', () => {
    expect(parseGitHubOrigin('https://github.com/VaibhavS45/auto.git')).toBe('VaibhavS45/auto')
    expect(parseGitHubOrigin('git@github.com:VaibhavS45/auto.git')).toBe('VaibhavS45/auto')
    expect(parseGitHubOrigin('ssh://git@github.com/VaibhavS45/auto')).toBe('VaibhavS45/auto')
    expect(parseGitHubOrigin('https://gitlab.com/a/b.git')).toBe(null)
  })

  it('rejects missing paths, files, and non-repos', async () => {
    expect((await validateRepoEntry({ path: '/no/such/dir-xyz', repo: 'a/b' })).ok).toBe(false)
    expect((await validateRepoEntry({ path: '/tmp', repo: 'not a repo!' })).ok).toBe(false)
    const noGit: Handler = async () => {
      throw new Error('not a git repository')
    }
    // /tmp exists and is a dir; without .git the git fallback runs and fails.
    const r = await validateRepoEntry({ path: '/tmp', repo: 'a/b' }, noGit)
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/git repo/i)
  })

  it('rejects origin mismatch, accepts match (case-insensitive) and missing origin', async () => {
    const { mkdtempSync, mkdirSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const dir = mkdtempSync(join(tmpdir(), 'gh-allow-'))
    mkdirSync(join(dir, '.git'))
    const withOrigin = (url: string): Handler => async () => ({ stdout: `${url}\n`, stderr: '' })

    const mismatch = await validateRepoEntry({ path: dir, repo: 'VaibhavS45/auto' }, withOrigin('https://github.com/other/repo.git'))
    expect(mismatch.ok).toBe(false)
    expect(mismatch.error).toMatch(/does not match/)

    const match = await validateRepoEntry({ path: dir, repo: 'vaibhavs45/auto' }, withOrigin('git@github.com:VaibhavS45/auto.git'))
    expect(match).toEqual({ ok: true })

    const noOrigin: Handler = async () => {
      throw new Error('no origin')
    }
    expect(await validateRepoEntry({ path: dir, repo: 'VaibhavS45/auto' }, noOrigin)).toEqual({ ok: true })
  })
})
