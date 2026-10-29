import { app } from 'electron'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { LocalAccountStore, migrateLegacyData, type LocalAccountRecord } from './local-accounts.js'

export interface LocalAccountBootstrap {
  /** Root userData: accounts.json + session.json live here, never account data. */
  baseDir: string
  account: LocalAccountRecord | null
  loginMode: boolean
}

/**
 * Per-account data isolation. Every account gets its own userData directory, so
 * palette-*.json stores (chats, connectors, routines, ...) never mix between
 * accounts. Signed out, the shell runs in a scratch directory. While a session
 * exists, userData is redirected before any store is created.
 */
export function bootstrapLocalAccountUserData(): LocalAccountBootstrap {
  const baseDir = app.getPath('userData')
  const store = new LocalAccountStore(baseDir)
  const session = store.readSession()
  const account = session ? store.getAccount(session.accountId) ?? null : null

  if (account) {
    const dir = store.userDataDir(account.id)
    mkdirSync(dir, { recursive: true })
    // Root-level files written before per-account isolation existed belong to
    // the first account; claim them once, new accounts start empty instead.
    if (account.primary) migrateLegacyData(baseDir, dir)
    app.setPath('userData', dir)
    app.setPath('sessionData', join(dir, 'session-data'))
    return { baseDir, account, loginMode: false }
  }

  const guestDir = store.loginDataDir()
  mkdirSync(guestDir, { recursive: true })
  app.setPath('userData', guestDir)
  app.setPath('sessionData', join(guestDir, 'session-data'))
  return { baseDir, account, loginMode: true }
}
