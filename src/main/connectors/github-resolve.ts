import { execFile } from 'node:child_process'
import { tool, type ToolSet } from 'ai'
import { z } from 'zod'
import type { ToolId } from '../../shared/types.js'
import { getRunContext } from '../agent/run-context.js'
import { requestNestedApprovalForCurrentRun } from '../agent/nested-approval.js'
import {
  resolveRepoEntry,
  type GitHubRepoEntry,
  type RunResult
} from './github-cli.js'
import type { ConnectorProvider, ToolStatus } from './provider.js'
import { runOpencodeResolve, type OpencodePermission } from '../agent/opencode-resolve.js'
import type { OpencodeServerManager } from '../agent/opencode-server.js'

/**
 * PR conflict resolution via OpenCode (@opencode-ai/sdk).
 *
 * Flow for "@github resolve conflicts on PR #N in owner/name":
 *  1. Verify the PR is conflicting + repo allowlisted.
 *  2. Create a NEW local branch from the PR head (never the default branch;
 *     refuses dirty worktrees and existing branch names).
 *  3. Merge the base in, hand conflicts to OpenCode (constrained prompt, no
 *     commit/push/remotes), run the repo's tests if a test command is set.
 *  4. Return summary + capped diff; the agent shows it in an approval card.
 *  5. github_commit_resolution commits locally ONLY after that approval.
 *  6. github_push_resolution pushes ONLY after a SEPARATE approval, never
 *     --force, never the default branch, only palette/resolve-pr-* branches.
 *
 * If OpenCode cannot resolve confidently it stops and reports files + reasons;
 * nothing is committed.
 */

export const GITHUB_RESOLVE_TOOLS = [
  'github_resolve_conflicts',
  'github_commit_resolution',
  'github_push_resolution'
] as const

/** Diff characters surfaced for review. */
export const RESOLVE_DIFF_CAP = 20000
/** gh/git timeout for one command. */
const CMD_TIMEOUT_MS = 120000

export const GITHUB_RESOLVE_PROMPT = [
  'To resolve PR merge conflicts: first use github_pr_details to confirm the PR is CONFLICTING.',
  'Then call github_resolve_conflicts (needs approval): it creates a NEW branch from the PR head, merges the base, and asks OpenCode to resolve.',
  'Show the returned diff to the user. Only after they approve the diff, call github_commit_resolution to commit locally.',
  'Push ONLY when the user explicitly asks, via github_push_resolution with its own separate approval. Never force-push. Never touch the default branch.'
].join(' ')

export interface ResolveDeps {
  getRepos: () => GitHubRepoEntry[]
  /** Injected in tests; production uses execFile (no shell). */
  run?: (cmd: 'git' | 'gh', args: string[], cwd?: string) => Promise<RunResult>
  getOpencode?: () => OpencodeServerManager
  opencodeResolve?: typeof runOpencodeResolve
}

function defaultRun(cmd: 'git' | 'gh', args: string[], cwd?: string): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { cwd, timeout: CMD_TIMEOUT_MS, maxBuffer: 32 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        reject(
          Object.assign(new Error(`${cmd} ${args[0] ?? ''} failed: ${(err as Error).message}`), {
            stdout: String(stdout ?? ''),
            stderr: String(stderr ?? '')
          })
        )
        return
      }
      resolve({ stdout: String(stdout ?? ''), stderr: String(stderr ?? '') })
    })
  })
}

function short(s: string, max = 500): string {
  return s.length > max ? `${s.slice(0, max)}…` : s
}

export function resolveBranchName(pr: number, now: number = Date.now()): string {
  return `palette/resolve-pr-${pr}-${now.toString(36)}`
}

export class GitHubResolveProvider implements ConnectorProvider {
  readonly id = 'github-resolve'

  constructor(private readonly deps: ResolveDeps) {}

  private run(cmd: 'git' | 'gh', args: string[], cwd?: string): Promise<RunResult> {
    return (this.deps.run ?? defaultRun)(cmd, args, cwd)
  }

  private entryFor(canonicalRepo: string): GitHubRepoEntry | undefined {
    return this.deps
      .getRepos()
      .find((e) => e.repo.trim().toLowerCase() === canonicalRepo.toLowerCase())
  }

  private checkAborted(): void {
    if (getRunContext()?.signal?.aborted) {
      throw Object.assign(new Error('Conflict resolution aborted.'), { name: 'AbortError' })
    }
  }

  private async defaultBranch(repo: string): Promise<string> {
    try {
      const { stdout } = await this.run('gh', ['repo', 'view', repo, '--json', 'defaultBranchRef'])
      const name = ((JSON.parse(stdout) as { defaultBranchRef?: { name?: string } }).defaultBranchRef?.name ?? '').trim()
      if (name) return name
    } catch {
      /* fall through */
    }
    return 'main'
  }

  private guardPushableBranch(branch: string, defaultBranch: string): string | null {
    if (branch === defaultBranch || branch === 'main' || branch === 'master') {
      return `Refusing: will never push to the default branch ("${branch}").`
    }
    if (!branch.startsWith('palette/resolve-pr-')) {
      return `Refusing: only palette/resolve-pr-* branches may be pushed (got "${branch}").`
    }
    return null
  }

  getTools(toolIds: ToolId[]): ToolSet {
    if (!toolIds.includes('github')) return {}

    const repoField = z.string().min(1).max(200).describe('Repo as owner/name, must be in the configured list')
    const prField = z.number().int().min(1).max(999999).describe('PR number')

    const resolveConflicts = tool({
      description:
        'Resolve a conflicting PR by creating a NEW branch from the PR head, merging the base, and asking OpenCode to resolve. Returns summary + diff for review. Commits NOTHING. Needs approval.',
      inputSchema: z.object({ repo: repoField, pr: prField }),
      execute: async (input) => this.resolveFlow(input.repo, input.pr)
    })

    const commitResolution = tool({
      description:
        'Commit the resolved working tree on a palette/resolve-pr-* branch. Verifies the branch is checked out, is not the default branch, and has changes. Show the diff in the approval card first. Needs approval.',
      inputSchema: z.object({
        repo: repoField,
        branch: z.string().min(1).max(200),
        message: z.string().min(1).max(500).describe('Commit message'),
        diffPreview: z.string().max(RESOLVE_DIFF_CAP + 500).optional().describe('Diff shown in the approval card (informational)')
      }),
      execute: async (input) => this.commitFlow(input.repo, input.branch, input.message)
    })

    const pushResolution = tool({
      description:
        'Push a palette/resolve-pr-* branch to origin. SEPARATE approval from commit. Never force-pushes, never pushes the default branch. Needs approval.',
      inputSchema: z.object({ repo: repoField, branch: z.string().min(1).max(200) }),
      execute: async (input) => this.pushFlow(input.repo, input.branch)
    })

    return {
      github_resolve_conflicts: resolveConflicts,
      github_commit_resolution: commitResolution,
      github_push_resolution: pushResolution
    } as unknown as ToolSet
  }

  /** Step 1-3: verify, branch, merge, OpenCode resolve. Commits nothing. */
  async resolveFlow(repoInput: string, pr: number): Promise<unknown> {
    const r = resolveRepoEntry(this.deps.getRepos(), repoInput)
    if (r.error) return r.error
    const repo = r.repo as string
    const entry = this.entryFor(repo)
    if (!entry) return `Repository "${repo}" is not in the configured GitHub repos list.`
    const cwd = entry.path
    try {
      this.checkAborted()
      // 1. Verify conflicting via gh (cheaper than a local merge attempt).
      let details: Record<string, unknown>
      try {
        const { stdout } = await this.run('gh', [
          'pr', 'view', String(pr), '--repo', repo,
          '--json', 'number,title,mergeable,mergeStateStatus,headRefName,baseRefName'
        ])
        details = JSON.parse(stdout) as Record<string, unknown>
      } catch (err) {
        return `Could not read PR #${pr}: ${ghErr(err)}`
      }
      const mergeable = String(details['mergeable'] ?? 'UNKNOWN')
      const mergeState = String(details['mergeStateStatus'] ?? 'UNKNOWN')
      if (mergeable !== 'CONFLICTING' && mergeState !== 'DIRTY') {
        return `PR #${pr} is not conflicting (mergeable=${mergeable}, mergeStateStatus=${mergeState}). Nothing to resolve.`
      }
      const base = String(details['baseRefName'] ?? '')
      if (!base) return `Could not determine the base branch of PR #${pr}.`
      const defaultBranch = await this.defaultBranch(repo)
      const branch = resolveBranchName(pr)
      const refused = this.guardPushableBranch(branch, defaultBranch)
      if (refused) return refused

      // 2. Worktree must be clean; branch must not exist; never touch default.
      const porcelain = (await this.run('git', ['status', '--porcelain'], cwd)).stdout.trim()
      if (porcelain) {
        return `Working tree at ${cwd} is dirty. Commit or stash your changes first — refusing to touch it.`
      }
      try {
        await this.run('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], cwd)
        return `Branch ${branch} already exists locally. Delete it or finish that run first.`
      } catch {
        /* does not exist — good */
      }
      this.checkAborted()
      await this.run('git', ['fetch', 'origin', `pull/${pr}/head:${branch}`], cwd)
      await this.run('git', ['checkout', branch], cwd)
      let mergeConflicted = false
      try {
        await this.run('git', ['merge', `origin/${base}`, '--no-edit'], cwd)
      } catch {
        mergeConflicted = true
      }
      const conflicted = mergeConflicted
        ? (await this.run('git', ['diff', '--name-only', '--diff-filter=U'], cwd)).stdout
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean)
        : []
      if (!mergeConflicted || conflicted.length === 0) {
        return `PR #${pr} merged into ${branch} cleanly — no conflicts to resolve after all.`
      }

      // 3. OpenCode resolves; tests run when configured.
      this.checkAborted()
      const manager = this.deps.getOpencode?.()
      if (!manager) return 'OpenCode integration is not available in this build.'
      await manager.start()
      const client = manager.client()
      const testCommand = entry.testCommand?.trim() || undefined
      const prompt = [
        `You are resolving a git merge conflict in ${cwd}.`,
        `Current branch ${branch} was created from PR #${pr} head; origin/${base} is merged in with conflicts.`,
        `Conflicted files: ${conflicted.join(', ')}.`,
        'Resolve each conflict preserving both sides\' intent; keep the project building.',
        'Rules: do NOT commit, do NOT push, do NOT touch remotes, do NOT run destructive commands.',
        testCommand ? `Then run the test command: ${testCommand}.` : 'No test command is configured — skip tests and say so.',
        'End with a single JSON object on its own line: {"resolved": [<files>], "unresolved": [{"file": ..., "reason": ...}]}.'
      ].join('\n')
      const outcome = await (this.deps.opencodeResolve ?? runOpencodeResolve)({
        client,
        directory: cwd,
        prompt,
        testCommand,
        signal: getRunContext()?.signal,
        onPermission: async (perm: OpencodePermission) =>
          (await requestNestedApprovalForCurrentRun({
            toolName: `opencode: ${perm.type} ${perm.title}`,
            input: { pattern: perm.pattern ?? null, metadata: perm.metadata ?? null },
            reason: 'OpenCode requests permission while resolving conflicts.'
          })).approved
      })
      if (outcome.unresolved.length > 0) {
        const lines = outcome.unresolved.map((u) => `- ${u.file}: ${u.reason}`).join('\n')
        return `OpenCode could not resolve all conflicts, stopping (nothing committed):\n${lines}`
      }
      const diffStat = (await this.run('git', ['diff', '--stat'], cwd)).stdout.slice(0, 2000)
      const fullDiff = (await this.run('git', ['diff'], cwd)).stdout
      const truncated = fullDiff.length > RESOLVE_DIFF_CAP
      return {
        branch,
        repo,
        pr,
        resolved: outcome.resolved,
        tests: testCommand ? `requested via: ${testCommand}` : 'no test command configured',
        summary: outcome.summary.slice(-2000),
        diffStat,
        diff: truncated ? `${fullDiff.slice(0, RESOLVE_DIFF_CAP)}\n…[truncated]` : fullDiff,
        diffTruncated: truncated,
        next: 'Show the diff to the user. Only after approval, call github_commit_resolution.'
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        try {
          await this.run('git', ['merge', '--abort'], cwd)
        } catch {
          /* nothing to abort */
        }
        return 'Conflict resolution aborted; merge aborted, working tree left untouched.'
      }
      return `Conflict resolution failed: ${short((err as Error).message ?? String(err))}`
    }
  }

  /** Step 5: commit locally after the diff approval. */
  async commitFlow(repoInput: string, branchInput: string, message: string): Promise<unknown> {
    const r = resolveRepoEntry(this.deps.getRepos(), repoInput)
    if (r.error) return r.error
    const entry = this.entryFor(r.repo as string)
    if (!entry) return `Repository "${repoInput}" is not in the configured GitHub repos list.`
    const cwd = entry.path
    const branch = branchInput.trim()
    try {
      this.checkAborted()
      const defaultBranch = await this.defaultBranch(r.repo as string)
      if (branch === defaultBranch || branch === 'main' || branch === 'master') {
        return `Refusing: will never commit conflict resolutions directly to the default branch ("${branch}").`
      }
      if (!branch.startsWith('palette/resolve-pr-')) {
        return `Refusing: only palette/resolve-pr-* branches may be committed by this tool (got "${branch}").`
      }
      const head = (await this.run('git', ['rev-parse', '--abbrev-ref', 'HEAD'], cwd)).stdout.trim()
      if (head !== branch) {
        return `Refusing: branch "${branch}" is not checked out (HEAD is "${head}"). Check it out and re-verify the diff first.`
      }
      const porcelain = (await this.run('git', ['status', '--porcelain'], cwd)).stdout.trim()
      if (!porcelain) return 'Nothing to commit — the working tree is clean.'
      await this.run('git', ['add', '-A'], cwd)
      await this.run('git', ['commit', '-m', message], cwd)
      const hash = (await this.run('git', ['rev-parse', '--short', 'HEAD'], cwd)).stdout.trim()
      return { committed: true, branch, hash, message }
    } catch (err) {
      return `Commit failed: ${short((err as Error).message ?? String(err))}`
    }
  }

  /** Step 6: push after a SEPARATE approval. Never --force. */
  async pushFlow(repoInput: string, branchInput: string): Promise<unknown> {
    const r = resolveRepoEntry(this.deps.getRepos(), repoInput)
    if (r.error) return r.error
    const entry = this.entryFor(r.repo as string)
    if (!entry) return `Repository "${repoInput}" is not in the configured GitHub repos list.`
    const cwd = entry.path
    const branch = branchInput.trim()
    try {
      this.checkAborted()
      const defaultBranch = await this.defaultBranch(r.repo as string)
      const refused = this.guardPushableBranch(branch, defaultBranch)
      if (refused) return refused
      await this.run('git', ['push', 'origin', branch], cwd)
      return { pushed: true, branch, remote: `origin/${branch}` }
    } catch (err) {
      return `Push failed (nothing was force-pushed): ${short((err as Error).message ?? String(err))}`
    }
  }

  async status(toolId: ToolId): Promise<ToolStatus> {
    if (toolId !== 'github') return { connected: false, detail: 'Unknown tool.' }
    // Reuse the gh check by delegating to a lightweight probe.
    try {
      await this.run('gh', ['auth', 'status'])
      const repos = this.deps.getRepos()
      return {
        connected: repos.length > 0,
        detail: repos.length > 0 ? `gh authenticated; conflict resolution ready (${repos.length} repo(s)).` : 'gh authenticated; no repos configured yet.'
      }
    } catch {
      return { connected: false, detail: 'gh is missing or not authenticated. Run `gh auth login`, and ensure opencode is on PATH.' }
    }
  }

  async connect(toolId: ToolId): Promise<{ ok: boolean; url?: string; error?: string }> {
    if (toolId !== 'github') return { ok: false, error: 'Unknown tool.' }
    return { ok: false, error: 'Run `gh auth login` in a terminal, then press Refresh.' }
  }
}

function ghErr(err: unknown): string {
  return short(String((err as { stderr?: unknown })?.stderr ?? (err as Error)?.message ?? err))
}
