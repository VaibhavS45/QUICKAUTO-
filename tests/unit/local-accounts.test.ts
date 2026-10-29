import { afterEach, describe, expect, it } from 'vitest'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LocalAccountService } from '../../src/main/auth/local-accounts.js'

const roots: string[] = []

const randomSalt = (): string => randomBytes(16).toString('hex')
const randomHash = (): string => randomBytes(64).toString('hex')

/** Flip one character of a recovery key but keep the 8×4 dash format. */
function deriveWrongKey(key: string): string {
  return (key.startsWith('A') ? 'B' : 'A') + key.slice(1)
}

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'palette-accounts-'))
  roots.push(root)
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('LocalAccountService', () => {
  it('starts signed out and reports that local sign-in is available', () => {
    const service = new LocalAccountService(tempRoot())
    expect(service.getState()).toEqual({
      signedIn: false,
      configured: true,
      hasAccounts: false,
      method: 'local'
    })
  })

  it('registers an account, persists only a salted hash, and signs in', async () => {
    const root = tempRoot()
    const service = new LocalAccountService(root)
    const state = await service.register({ username: 'Alice', password: 'secret-password' })

    expect(state).toEqual({
      signedIn: true,
      configured: true,
      hasAccounts: true,
      method: 'local',
      name: 'alice',
      recoveryKey: expect.any(String)
    })
    const registry = readFileSync(join(root, 'accounts.json'), 'utf8')
    expect(registry).not.toContain('secret-password')
    expect(registry).toContain('"salt"')
    expect(registry).toContain('"hash"')
    expect(typeof state.recoveryKey).toBe('string')
    expect(state.recoveryKey).toMatch(/^([0-9A-F]{4}-){7}[0-9A-F]{4}$/)
    const account = service.store.listAccounts()[0]
    expect(account).toBeDefined()
    expect(account!.recoverySalt).toBeDefined()
    expect(account!.recoveryHash).toBeDefined()
    expect(registry).not.toContain(state.recoveryKey!)
    expect(existsSync(service.store.userDataDir(account!.id))).toBe(true)
    expect(existsSync(join(root, 'session.json'))).toBe(true)
  })

  it('logs out, rejects a bad password, and logs back in', async () => {
    const root = tempRoot()
    const service = new LocalAccountService(root)
    await service.register({ username: 'alice', password: 'secret-password' })
    expect((await service.logout()).signedIn).toBe(false)

    await expect(service.login({ username: 'alice', password: 'wrong-password' }))
      .rejects.toThrow('Incorrect username or password.')
    const state = await service.login({ username: 'ALICE', password: 'secret-password' })
    expect(state.signedIn).toBe(true)
    expect(state.name).toBe('alice')
    expect(new LocalAccountService(root).getState().signedIn).toBe(true)
  })

  it('rejects duplicate usernames and invalid credentials', async () => {
    const service = new LocalAccountService(tempRoot())
    await service.register({ username: 'alice', password: 'secret-password' })
    await expect(service.register({ username: 'ALICE', password: 'another-password' }))
      .rejects.toThrow('already exists')
    await expect(service.register({ username: 'ab', password: 'secret-password' }))
      .rejects.toThrow('at least 3')
    await expect(service.register({ username: 'bad name', password: 'secret-password' }))
      .rejects.toThrow('letters, numbers')
    await expect(service.register({ username: 'alice', password: 'short' }))
      .rejects.toThrow('at least 8')
  })

  it('moves legacy data into the first account only and never deletes it', async () => {
    const root = tempRoot()
    writeFileSync(join(root, 'palette-chats.json'), '{"chat-threads":[]}')
    writeFileSync(join(root, 'palette-shell.json'), '{"recent-runs":[]}')
    mkdirSync(join(root, 'run-artifacts', 'run-1'), { recursive: true })
    writeFileSync(join(root, 'run-artifacts', 'run-1', 'output.txt'), 'kept')

    const service = new LocalAccountService(root)
    await service.register({ username: 'owner', password: 'owner-password' })
    const owner = service.store.listAccounts()[0]!
    expect(owner.primary).toBe(true)
    const ownerDir = service.store.userDataDir(owner.id)
    expect(readFileSync(join(ownerDir, 'palette-chats.json'), 'utf8')).toContain('chat-threads')
    expect(readFileSync(join(ownerDir, 'run-artifacts', 'run-1', 'output.txt'), 'utf8')).toBe('kept')
    expect(existsSync(join(root, 'palette-chats.json'))).toBe(true)
    expect(existsSync(join(root, 'run-artifacts', 'run-1', 'output.txt'))).toBe(true)

    await service.register({ username: 'guest', password: 'guest-password' })
    const guest = service.store.listAccounts().find((account) => account.username === 'guest')!
    expect(guest.primary).toBeUndefined()
    expect(existsSync(join(service.store.userDataDir(guest.id), 'palette-chats.json'))).toBe(false)
  })

  it('uses the session only as a one-time handoff to the restarted process', async () => {
    const root = tempRoot()
    const service = new LocalAccountService(root)
    const state = await service.register({ username: 'alice', password: 'secret-password' })
    const { recoveryKey, ...sessionState } = state
    expect(recoveryKey).toBeDefined()
    const account = service.store.listAccounts()[0]!
    const session = service.store.takeSession()
    expect(session?.accountId).toBe(account.id)
    expect(new LocalAccountService(root).getState().signedIn).toBe(false)
    // getState (not register) never repeats the one-time recovery key.
    expect(new LocalAccountService(root, session!.accountId).getState()).toEqual(sessionState)
  })

  it('resets the password with the recovery key and signs in', async () => {
    const root = tempRoot()
    const service = new LocalAccountService(root)
    const { recoveryKey } = await service.register({ username: 'alice', password: 'secret-password' })
    expect(recoveryKey).toBeDefined()
    await service.logout()

    // Keys compare case-insensitively, ignoring dashes and spaces.
    await expect(service.resetPassword({
      username: 'ALICE',
      recoveryKey: recoveryKey!.toLowerCase().replace(/-/g, ' '),
      password: 'brand-new-pass'
    })).resolves.toMatchObject({ signedIn: true, name: 'alice' })

    await expect(service.login({ username: 'alice', password: 'secret-password' }))
      .rejects.toThrow('Incorrect username or password.')
    const state = await service.login({ username: 'alice', password: 'brand-new-pass' })
    expect(state.signedIn).toBe(true)
    // The reset signed the account in, so a restarted service resumes that session.
    expect(new LocalAccountService(root).getState().signedIn).toBe(true)
  })

  it('rejects reset attempts with a wrong recovery key, unknown account, or no key stored', async () => {
    const root = tempRoot()
    const service = new LocalAccountService(root)
    const { recoveryKey } = await service.register({ username: 'alice', password: 'secret-password' })
    await service.logout()

    await expect(service.resetPassword({
      username: 'alice',
      recoveryKey: deriveWrongKey(recoveryKey!),
      password: 'brand-new-pass'
    })).rejects.toThrow('does not match')

    await expect(service.resetPassword({
      username: 'nobody',
      recoveryKey: recoveryKey!,
      password: 'brand-new-pass'
    })).rejects.toThrow('No account with that username.')

    // Hand-write an account record with no recovery hash to simulate pre-key accounts.
    const legacy = {
      version: 1,
      accounts: [{
        id: '11111111-2222-3333-4444-555555555555',
        username: 'legacy',
        salt: randomSalt(),
        hash: randomHash(),
        createdAt: Date.now()
      }]
    }
    writeFileSync(join(root, 'accounts.json'), JSON.stringify(legacy))
    await expect(service.resetPassword({
      username: 'legacy',
      recoveryKey: recoveryKey!,
      password: 'brand-new-pass'
    })).rejects.toThrow('no recovery key')
  })

  it('ignores a session that points at a missing account', async () => {
    const root = tempRoot()
    writeFileSync(join(root, 'session.json'), JSON.stringify({
      accountId: '00000000-0000-0000-0000-000000000000',
      signedInAt: Date.now()
    }))
    expect(new LocalAccountService(root).getState().signedIn).toBe(false)
  })
})
