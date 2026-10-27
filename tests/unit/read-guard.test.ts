import { describe, expect, it, afterAll, beforeEach, vi } from 'vitest'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { existsSync } from 'node:fs'
import { createBuiltinTools } from '../../src/main/agent/tools.js'
import { runWithContext } from '../../src/main/agent/run-context.js'
import { setNestedApprovalHandler, type NestedApprovalRequest } from '../../src/main/agent/nested-approval.js'
import { parseSharedPaths, sharedPathsForRun } from '../../src/main/agent/read-guard.js'

const HOME = path.join(process.cwd(), 'out', 'read-guard-test-home')
vi.mock('node:os', () => ({ homedir: () => HOME }))

const read_file = createBuiltinTools().read_file as unknown as { execute: (input: { path: string }) => Promise<unknown> }

const TOOL_DIR = path.join(process.cwd(), 'out', 'read-guard-test-shared')

const SENSITIVE: Array<[string, string]> = [
  ['.ssh/id_ed25519', 'private key'],
  ['.aws/credentials', 'aws'],
  ['.gnupg/pubring.kbx', 'gpg'],
  ['.config/gcloud/credentials.db', 'gcloud'],
  ['.kube/config', 'kube'],
  ['.docker/config.json', 'docker'],
  ['.npmrc', 'npm'],
  ['.netrc', 'netrc'],
  ['.git-credentials', 'git'],
  ['.mozilla/firefox/profiles.ini', 'firefox'],
  ['.config/google-chrome/Default/Preferences', 'chrome'],
  ['proj/server.key', 'key'],
  ['proj/cert.pem', 'pem'],
  ['proj/.env', 'env'],
  ['proj/.env.local', 'env'],
  ['proj/id_rsa.pub', 'id']
]

afterAll(() => {
  vi.restoreAllMocks()
  rm(path.join(process.cwd(), 'out', 'read-guard-test'), { recursive: true, force: true }).catch(() => {})
})

beforeEach(async () => {
  if (!existsSync(HOME)) await mkdir(HOME, { recursive: true })
})

async function seed(rel: string, content: string): Promise<string> {
  const file = path.join(HOME, rel)
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, content, 'utf8')
  return file
}

let approvals: NestedApprovalRequest[] = []

function resetHandler(
  decision: { approved: boolean; reason?: string } = { approved: true }
): void {
  approvals = []
  setNestedApprovalHandler(async (req) => {
    approvals.push(req)
    return decision
  })
}

function ctx(over: Partial<Parameters<typeof runWithContext>[0]> = {}) {
  return { runId: 'r1', source: 'chat', sharedFolders: [TOOL_DIR], untrustedIngested: false, ...over } as never
}

describe('W3 sensitive-path denial for read_file', () => {
  it('R0: still allows normal files without a run context (legacy behaviour)', async () => {
    const file = await seed('proj/notes.txt', 'hello')
    const res = (await read_file.execute({ path: file })) as { content: string }
    expect(res.content).toBe('hello')
  })

  it('R1: resolves symlinks and refuses targets that are sensitive', async () => {
    const key = await seed('.ssh/id_rsa', 'SECRET')
    const alias = path.join(process.cwd(), 'out', 'read-guard-test', 'alias.txt')
    await rm(alias, { force: true }).catch(() => {})
    await mkdir(path.dirname(alias), { recursive: true })
    await symlink(key, alias)
    await expect(read_file.execute({ path: alias })).rejects.toThrow(/sensitive/i)
  })

  it('R2: refuses known sensitive system/credential files', async () => {
    for (const [rel] of SENSITIVE) {
      const file = await seed(rel, 'x')
      await expect(read_file.execute({ path: file })).rejects.toThrow(/sensitive/i)
    }
  })

  it('R3: asks for approval once a run has ingested untrusted web/email content; denial blocks the read', async () => {
    const secret = await seed('proj/notes-untrusted.txt', 'body')
    resetHandler({ approved: true })
    const ok = await runWithContext(ctx({ untrustedIngested: true }), () =>
      read_file.execute({ path: secret })
    )
    expect((ok as { content: string }).content).toBe('body')
    expect(approvals.some((a) => a.toolName === 'read_file')).toBe(true)

    resetHandler({ approved: false, reason: 'nope' })
    await expect(
      runWithContext(ctx({ untrustedIngested: true }), () => read_file.execute({ path: secret }))
    ).rejects.toThrow(/denied|approval/i)
  })

  it('R4: no approval card when nothing untrusted was ingested', async () => {
    const file = await seed('proj/notes-fresh.txt', 'plain')
    resetHandler({ approved: true })
    const res = await runWithContext(ctx(), () => read_file.execute({ path: file }))
    expect((res as { content: string }).content).toBe('plain')
    expect(approvals).toHaveLength(0)
  })

  it('R5: scheduled runs read only inside shared folders (fail-closed, no approval card)', async () => {
    await mkdir(TOOL_DIR, { recursive: true })
    const inside = path.join(TOOL_DIR, 'input.txt')
    await writeFile(inside, 'data', 'utf8')
    const outside = await seed('proj/notes-sched.txt', 'secret-ish')
    resetHandler({ approved: true })
    await expect(
      runWithContext(ctx({ source: 'scheduled' }), () => read_file.execute({ path: inside }))
    ).resolves.toMatchObject({ content: 'data' })
    await expect(
      runWithContext(ctx({ source: 'scheduled' }), () => read_file.execute({ path: outside }))
    ).rejects.toThrow(/inside the folders shared/i)
    expect(approvals).toHaveLength(0)
  })

  it('R6: reads inside a shared folder need no approval even with untrusted content', async () => {
    const inside = path.join(TOOL_DIR, 'attached.txt')
    await writeFile(inside, 'data', 'utf8')
    resetHandler({ approved: true })
    const res = await runWithContext(ctx({ untrustedIngested: true }), () =>
      read_file.execute({ path: inside })
    )
    expect((res as { content: string }).content).toBe('data')
    expect(approvals).toHaveLength(0)
  })

  it('R7: parseSharedPaths extracts local dirs from @/path prompt mentions', async () => {
    const dir = await mkdtemp(path.join(process.cwd(), 'out', 'read-guard-test'))
    const file = path.join(dir, 'doc.txt')
    await writeFile(file, 'x', 'utf8')
    const got = await parseSharedPaths([`check this @${file} please and @${dir} also @drive:abc`])
    expect(got).toContain(dir)
    expect(got.every((p) => path.isAbsolute(p))).toBe(true)
  })

  it('R8: narrowed key filename rules — id_rsa/ed25519/ecdsa/dsa, .env, .env.*, .envrc denied; lookalikes allowed', async () => {
    for (const rel of ['id_rsa', 'id_rsa.pub', 'id_ed25519', 'id_ecdsa', 'id_dsa', '.env', '.env.local', '.envrc']) {
      const file = await seed(rel, 'x')
      await expect(read_file.execute({ path: file })).rejects.toThrow(/sensitive/i)
    }
    // Broad id_*/.env* prefixes must NOT deny these.
    for (const rel of ['proj/id_bad.txt', 'proj/identity.jpg', 'proj/.environment', 'proj/keys.txt']) {
      const file = await seed(rel, 'x')
      const res = (await read_file.execute({ path: file })) as { content: string }
      expect(res.content).toBe('x')
    }
  })

  it('R9: shared folders come only from user-authored messages (prompt + user history)', async () => {
    const userDir = await mkdtemp(path.join(process.cwd(), 'out', 'read-guard-test'))
    const toolDir = await mkdtemp(path.join(process.cwd(), 'out', 'read-guard-test'))
    const userText = `use @${userDir}`
    const assistantText = `I listed @${toolDir} for you`
    const got = sharedPathsForRun('do things', [
      { role: 'user' as const, text: userText },
      { role: 'assistant' as const, text: assistantText }
    ])
    expect(got).toContain(userDir)
    expect(got).not.toContain(toolDir)
    // The live prompt (user-authored) is always trusted.
    expect(sharedPathsForRun(`summarize @${toolDir}`, [])).toContain(toolDir)
  })
})
