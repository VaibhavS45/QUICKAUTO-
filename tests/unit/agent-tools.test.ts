import { describe, expect, it } from 'vitest'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createBuiltinTools } from '../../src/main/agent/tools.js'

const tools = createBuiltinTools()

function exec(names: keyof ReturnType<typeof createBuiltinTools>): (input: unknown) => Promise<unknown> {
  const t = tools[names] as unknown as { execute: (input: unknown) => Promise<unknown> }
  return t.execute.bind(t)
}

const read_file = exec('read_file')
const work = path.join(tmpdir(), 'palette-tools-test')

async function seed(name: string, content: string): Promise<string> {
  await mkdir(work, { recursive: true })
  const p = path.join(work, name)
  await writeFile(p, content, 'utf8')
  return p
}

describe('read_file', () => {
  it('returns content for a small text file inside allowed roots', async () => {
    const p = await seed('hello.txt', 'hello world\n')
    const res = (await read_file({ path: p })) as { ok: boolean; content: string; bytes: number }
    expect(res.ok).toBe(true)
    expect(res.content).toBe('hello world\n')
    expect(res.bytes).toBe(12)
  })

  it('resolves relative paths against the process cwd', async () => {
    await mkdir(work, { recursive: true })
    const p = await seed('hello.txt', 'hi')
    const relative = path.relative(process.cwd(), p)
    const res = (await read_file({ path: relative })) as { ok: boolean; content: string }
    expect(res.ok).toBe(true)
    expect(res.content).toBe('hi')
  })

  it('refuses paths outside allowed roots', async () => {
    await expect(read_file({ path: '/etc/hostname' })).rejects.toThrow(/may be read/i)
    await expect(read_file({ path: path.join(work, '..', '..', '..', 'outside.txt') })).rejects.toThrow(/may be read/i)
  })

  it('gives a clear error for a missing file', async () => {
    await expect(read_file({ path: path.join(work, 'nope.txt') })).rejects.toThrow(/File not found/)
  })

  it('refuses directories', async () => {
    await mkdir(work, { recursive: true })
    await expect(read_file({ path: work })).rejects.toThrow(/directory/)
  })

  it('refuses oversized files', async () => {
    const p = await seed('big.txt', 'x'.repeat(600_000))
    await expect(read_file({ path: p })).rejects.toThrow(/too large/i)
  })

  it('refuses binary-looking content', async () => {
    const p = await seed('bin.dat', 'ok\u0000\u0000\u0000\u0000\u0000')
    await expect(read_file({ path: p })).rejects.toThrow(/binary/i)
  })
})

describe('write_file', () => {
  it('still refuses paths outside allowed roots', async () => {
    const write = exec('write_file')
    await expect(write({ path: '/etc/nope', content: 'x' })).rejects.toThrow(/may be written/i)
  })

  it('writes and re-reads through read_file', async () => {
    const p = await seed('round.txt', 'before')
    const write = exec('write_file')
    await write({ path: p, content: 'after' })
    expect(await readFile(p, 'utf8')).toBe('after')
  })
})

describe('registry', () => {
  it('exposes the read tool alongside the write and echo tools', () => {
    expect(Object.keys(tools).sort()).toEqual(['echo', 'echo_write', 'read_file', 'write_file'])
  })
})

describe('cleanup', () => {
  it('removes the seeded dir', async () => {
    await rm(work, { recursive: true, force: true })
    expect(true).toBe(true)
  })
})
