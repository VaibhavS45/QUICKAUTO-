import { afterEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const electron = vi.hoisted(() => ({
  paths: new Map<string, string>()
}))

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => electron.paths.get(name) ?? '',
    setPath: (name: string, value: string) => {
      electron.paths.set(name, value)
    }
  }
}))

import { LocalAccountService } from '../../src/main/auth/local-accounts.js'
import { bootstrapLocalAccountUserData } from '../../src/main/auth/user-data-bootstrap.js'

const roots: string[] = []

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'palette-bootstrap-'))
  roots.push(root)
  return root
}

afterEach(() => {
  electron.paths.clear()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('bootstrapLocalAccountUserData', () => {
  it('redirects userData into the signed-in account directory and stays out of login mode', async () => {
    const root = tempRoot()
    const service = new LocalAccountService(root)
    await service.register({ username: 'alice', password: 'secret-password' })
    const account = service.store.listAccounts()[0]!

    electron.paths.set('userData', root)
    const result = bootstrapLocalAccountUserData()

    expect(result.loginMode).toBe(false)
    expect(result.account?.id).toBe(account.id)
    // Stores bind their file paths from userData at boot, so the redirect must
    // land in the account's own directory, with Chromium session data inside it.
    expect(electron.paths.get('userData')).toBe(service.store.userDataDir(account.id))
    expect(electron.paths.get('sessionData')).toBe(join(service.store.userDataDir(account.id), 'session-data'))
    expect(existsSync(service.store.userDataDir(account.id))).toBe(true)
  })

  it('runs signed out in a guest scratch directory and reports login mode', () => {
    const root = tempRoot()
    electron.paths.set('userData', root)
    const result = bootstrapLocalAccountUserData()
    expect(result.loginMode).toBe(true)
    expect(result.account).toBeNull()
    expect(electron.paths.get('userData')).toBe(join(root, 'users', '_login'))
    expect(electron.paths.get('sessionData')).toBe(join(root, 'users', '_login', 'session-data'))
  })

  it('claims root legacy files once for the primary account only', async () => {
    const root = tempRoot()
    writeFileSync(join(root, 'palette-chats.json'), '{"chat-threads":[]}')
    writeFileSync(join(root, 'palette-shell.json'), '{"recent-runs":[]}')

    const service = new LocalAccountService(root)
    await service.register({ username: 'owner', password: 'owner-password' }) // primary
    const owner = service.store.listAccounts()[0]!
    expect(owner.primary).toBe(true)

    electron.paths.set('userData', root)
    bootstrapLocalAccountUserData()

    const dir = service.store.userDataDir(owner.id)
    expect(readFileSync(join(dir, 'palette-chats.json'), 'utf8')).toContain('chat-threads')
    expect(existsSync(join(dir, '.legacy-imported'))).toBe(true)

    // Root files are never deleted, and a second claim must not overwrite.
    writeFileSync(join(dir, 'palette-shell.json'), '{"recent-runs":["edited"]}')
    writeFileSync(join(root, 'palette-chats.json'), '{"chat-threads":["changed"]}')
    bootstrapLocalAccountUserData()
    expect(readFileSync(join(dir, 'palette-shell.json'), 'utf8')).toContain('"edited"')
    expect(existsSync(join(root, 'palette-chats.json'))).toBe(true)
  })

  it('starts secondary accounts with no legacy import at all', async () => {
    const root = tempRoot()
    writeFileSync(join(root, 'palette-chats.json'), '{"chat-threads":["shared-dirty"]}')

    const service = new LocalAccountService(root)
    await service.register({ username: 'owner', password: 'owner-password' })
    await service.register({ username: 'second', password: 'second-password' })
    const second = service.store.listAccounts().find((account) => account.username === 'second')!
    expect(second.primary).toBeUndefined()

    electron.paths.set('userData', root)
    bootstrapLocalAccountUserData()

    const dir = service.store.userDataDir(second.id)
    expect(electron.paths.get('userData')).toBe(dir)
    // New accounts start empty: the shared-dirty file must not leak in.
    expect(existsSync(join(dir, 'palette-chats.json'))).toBe(false)
    expect(existsSync(join(dir, '.legacy-imported'))).toBe(false)
  })
})
