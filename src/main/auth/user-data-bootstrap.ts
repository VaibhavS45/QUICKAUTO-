import { app } from 'electron'
import { LocalAccountStore, type LocalAccountRecord } from './local-accounts.js'

export interface LocalAccountBootstrap {
  baseDir: string
  account: LocalAccountRecord | null
  loginMode: boolean
}

export function bootstrapLocalAccountUserData(): LocalAccountBootstrap {
  const baseDir = app.getPath('userData')
  const store = new LocalAccountStore(baseDir)
  const session = store.readSession()
  const account = session ? store.getAccount(session.accountId) ?? null : null
  // Paused for development: do not redirect userData / sessionData to separate subdirectories,
  // and do not lock down in loginMode.
  return { baseDir, account, loginMode: false }
}

