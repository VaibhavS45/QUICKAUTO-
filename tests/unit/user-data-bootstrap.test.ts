import { afterEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
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
  it('moves Electron into the signed-in account and consumes the handoff', async () => {
    const root = tempRoot()
    const service = new LocalAccountService(root)
    const state = await service.register({ username: 'alice', password: 'secret-password' })
    const account = service.store.listAccounts()[0]!

    electron.paths.set('userData', root)
    const result = bootstrapLocalAccountUserData()

    expect(result.loginMode).toBe(false)
    expect(result.account?.id).toBe(account.id)
    expect(state.signedIn).toBe(true)
    expect(electron.paths.get('userData')).toBe(join(root, 'users', account.id))
    expect(electron.paths.get('sessionData')).toBe(join(root, 'users', account.id, 'session-data'))
    expect(existsSync(join(root, 'users', account.id, 'session-data'))).toBe(true)
    expect(existsSync(join(root, 'session.json'))).toBe(false)
  })

  it('stays in login mode when there is no handoff', () => {
    const root = tempRoot()
    electron.paths.set('userData', root)
    const result = bootstrapLocalAccountUserData()
    expect(result.loginMode).toBe(true)
    expect(result.account).toBeNull()
    expect(electron.paths.get('userData')).toBe(join(root, 'users', '_login'))
  })
})
