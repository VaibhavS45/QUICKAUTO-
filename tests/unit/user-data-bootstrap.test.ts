import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
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
  it('keeps Electron in base userData and stays out of login mode with signed-in account', async () => {
    const root = tempRoot()
    const service = new LocalAccountService(root)
    const state = await service.register({ username: 'alice', password: 'secret-password' })
    const account = service.store.listAccounts()[0]!

    electron.paths.set('userData', root)
    const result = bootstrapLocalAccountUserData()

    expect(result.loginMode).toBe(false)
    expect(result.account?.id).toBe(account.id)
    expect(state.signedIn).toBe(true)
    // Separate data area is cut off: userData remains at baseDir
    expect(electron.paths.get('userData')).toBe(root)
    expect(electron.paths.get('sessionData')).toBeUndefined()
  })

  it('stays out of login mode and in base userData even when there is no account', () => {
    const root = tempRoot()
    electron.paths.set('userData', root)
    const result = bootstrapLocalAccountUserData()
    expect(result.loginMode).toBe(false)
    expect(result.account).toBeNull()
    expect(electron.paths.get('userData')).toBe(root)
  })
})
