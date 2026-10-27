import { app } from 'electron'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { LocalAccountStore, type LocalAccountRecord } from './local-accounts.js'

export interface LocalAccountBootstrap {
  baseDir: string
  account: LocalAccountRecord | null
  loginMode: boolean
}

export function bootstrapLocalAccountUserData(): LocalAccountBootstrap {
  const baseDir = app.getPath('userData')
  const store = new LocalAccountStore(baseDir)
  const session = store.takeSession()
  const account = session ? store.getAccount(session.accountId) ?? null : null
  const userDir = account ? store.userDataDir(account.id) : store.loginDataDir()
  const sessionDataDir = join(userDir, 'session-data')
  mkdirSync(sessionDataDir, { recursive: true })
  app.setPath('userData', userDir)
  app.setPath('sessionData', sessionDataDir)
  return { baseDir, account, loginMode: !account }
}
