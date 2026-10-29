import { randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto'
import { constants, copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { AuthCredentialsSchema, AuthResetSchema, type AuthCredentials, type AuthState } from '../../shared/contracts/auth.js'

const ACCOUNTS_FILE = 'accounts.json'
const SESSION_FILE = 'session.json'
const USERS_DIR = 'users'
const LOGIN_DIR = '_login'
const HASH_BYTES = 64
const SALT_BYTES = 16
const ID_PATTERN = /^[0-9a-f-]{36}$/i
const SALT_PATTERN = /^[0-9a-f]{32}$/i
const HASH_PATTERN = /^[0-9a-f]{128}$/i
const SCRYPT_OPTIONS = { N: 16_384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 }

const LEGACY_FILES = [
  'config.json',
  'palette-auth.json',
  'palette-budget.json',
  'palette-chats.json',
  'palette-connectors.json',
  'palette-identity.json',
  'palette-routines.json',
  'palette-shell.json',
  'palette-notifications.json',
  'palette-plugins.json',
  'palette-agents.json',
  'palette-mcp.json',
  'palette-mcp-secrets.json'
]
const LEGACY_DIRS = ['plugins', 'run-artifacts']

export interface LocalAccountRecord {
  id: string
  username: string
  salt: string
  hash: string
  createdAt: number
  primary?: boolean
  /** Hash of the one-time recovery key; the key itself is never stored. */
  recoverySalt?: string
  recoveryHash?: string
}

interface AccountRegistry {
  version: 1
  accounts: LocalAccountRecord[]
}

interface AccountSession {
  accountId: string
  signedInAt: number
}

const emptyRegistry = (): AccountRegistry => ({ version: 1, accounts: [] })

function normalizeUsername(username: string): string {
  return username.trim().toLowerCase()
}

function isAccountRecord(value: unknown): value is LocalAccountRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as Partial<LocalAccountRecord>
  return (
    typeof record.id === 'string' &&
    ID_PATTERN.test(record.id) &&
    typeof record.username === 'string' &&
    record.username.length > 0 &&
    typeof record.salt === 'string' &&
    SALT_PATTERN.test(record.salt) &&
    typeof record.hash === 'string' &&
    HASH_PATTERN.test(record.hash) &&
    typeof record.createdAt === 'number' &&
    (record.primary === undefined || typeof record.primary === 'boolean') &&
    (record.recoverySalt === undefined || (typeof record.recoverySalt === 'string' && SALT_PATTERN.test(record.recoverySalt))) &&
    (record.recoveryHash === undefined || (typeof record.recoveryHash === 'string' && HASH_PATTERN.test(record.recoveryHash)))
  )
}

function isSession(value: unknown): value is AccountSession {
  if (!value || typeof value !== 'object') return false
  const session = value as Partial<AccountSession>
  return (
    typeof session.accountId === 'string' &&
    ID_PATTERN.test(session.accountId) &&
    typeof session.signedInAt === 'number'
  )
}

function backupCorrupt(path: string): void {
  if (!existsSync(path)) return
  try {
    renameSync(path, `${path}.corrupt-${Date.now()}`)
  } catch {
    return
  }
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown
  } catch {
    if (existsSync(path)) backupCorrupt(path)
    return null
  }
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.${randomUUID()}.tmp`
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  renameSync(tmp, path)
}

function parseCredentials(input: unknown): AuthCredentials {
  const parsed = AuthCredentialsSchema.safeParse(input)
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Invalid username or password.')
  }
  return parsed.data
}

function scrypt(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, HASH_BYTES, SCRYPT_OPTIONS, (error, key) => {
      if (error) reject(error)
      else resolve(key)
    })
  })
}

function copyLegacyData(baseDir: string, destination: string): void {
  mkdirSync(destination, { recursive: true })
  for (const name of LEGACY_FILES) {
    const source = join(baseDir, name)
    const target = join(destination, name)
    if (!existsSync(source) || existsSync(target)) continue
    try {
      copyFileSync(source, target, constants.COPYFILE_EXCL)
    } catch {
      continue
    }
  }
  for (const name of LEGACY_DIRS) {
    const source = join(baseDir, name)
    const target = join(destination, name)
    if (!existsSync(source) || existsSync(target)) continue
    try {
      cpSync(source, target, { recursive: true, force: false, errorOnExist: false })
    } catch {
      continue
    }
  }
}

/** Marker: root-level legacy files were once claimed by this account directory. */
const LEGACY_IMPORT_MARK = '.legacy-imported'

/**
 * Root-level legacy files belong to exactly one account: they are copied into
 * the primary account's data dir once, marked, and never re-imported or
 * overwritten — the copy is a snapshot, and later boots only fill gaps.
 */
export function migrateLegacyData(baseDir: string, destination: string): void {
  if (!existsSync(join(destination, LEGACY_IMPORT_MARK))) {
    copyLegacyData(baseDir, destination)
    try {
      writeFileSync(
        join(destination, LEGACY_IMPORT_MARK),
        `${new Date().toISOString()}\n`,
        { encoding: 'utf8', mode: 0o600 }
      )
    } catch {
      // Worst case the import is retried next boot; copyLegacyData only fills gaps.
    }
  }
}

export class LocalAccountStore {
  constructor(readonly baseDir: string) {}

  get accountsPath(): string {
    return join(this.baseDir, ACCOUNTS_FILE)
  }

  get sessionPath(): string {
    return join(this.baseDir, SESSION_FILE)
  }

  userDataDir(accountId: string): string {
    return join(this.baseDir, USERS_DIR, accountId)
  }

  loginDataDir(): string {
    return join(this.baseDir, USERS_DIR, LOGIN_DIR)
  }

  listAccounts(): LocalAccountRecord[] {
    const raw = readJson(this.accountsPath) as Partial<AccountRegistry> | null
    if (!raw || !Array.isArray(raw.accounts)) return []
    return raw.accounts.filter(isAccountRecord)
  }

  findAccount(username: string): LocalAccountRecord | undefined {
    const normalized = normalizeUsername(username)
    return this.listAccounts().find((account) => account.username === normalized)
  }

  getAccount(accountId: string): LocalAccountRecord | undefined {
    return this.listAccounts().find((account) => account.id === accountId)
  }

  addAccount(account: LocalAccountRecord): void {
    const registry = emptyRegistry()
    registry.accounts = [...this.listAccounts(), account]
    writeJson(this.accountsPath, registry)
  }

  updateAccount(accountId: string, patch: Partial<LocalAccountRecord>): void {
    const accounts = this.listAccounts()
    const next = accounts.map((account) => (account.id === accountId ? { ...account, ...patch } : account))
    if (next.every((account, index) => account === accounts[index])) return
    const registry = emptyRegistry()
    registry.accounts = next
    writeJson(this.accountsPath, registry)
  }

  readSession(): AccountSession | null {
    const raw = readJson(this.sessionPath)
    if (!isSession(raw)) return null
    if (!this.getAccount(raw.accountId)) return null
    return raw
  }

  takeSession(): AccountSession | null {
    const session = this.readSession()
    if (session || existsSync(this.sessionPath)) this.clearSession()
    return session
  }

  writeSession(accountId: string): void {
    const session: AccountSession = { accountId, signedInAt: Date.now() }
    writeJson(this.sessionPath, session)
  }

  clearSession(): void {
    rmSync(this.sessionPath, { force: true })
  }
}

/** One-time recovery key: typeable 8×4 hex groups; the app stores only its hash. */
function generateRecoveryKey(): string {
  const hex = randomBytes(16).toString('hex')
  return (hex.match(/.{4}/g) ?? [hex]).join('-').toUpperCase()
}

/** Recovery keys compare case-insensitively, ignoring dashes and spaces. */
function normalizeRecoveryKey(key: string): string {
  return key.replace(/[^0-9a-zA-Z]/g, '').toLowerCase()
}

const parseReset = (input: unknown): { username: string; recoveryKey: string; password: string } => {
  const parsed = AuthResetSchema.safeParse(input)
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Invalid reset request.')
  return parsed.data
}

export class LocalAccountService {
  readonly store: LocalAccountStore
  private currentId: string | null

  constructor(baseDir: string, initialAccountId: string | null = null) {
    this.store = new LocalAccountStore(baseDir)
    this.currentId = initialAccountId ?? this.store.readSession()?.accountId ?? null
  }

  getState(): AuthState {
    const account = this.currentAccount()
    return {
      signedIn: Boolean(account),
      configured: true,
      hasAccounts: this.store.listAccounts().length > 0,
      method: 'local',
      ...(account ? { name: account.username } : {})
    }
  }

  currentAccount(): LocalAccountRecord | null {
    if (!this.currentId) return null
    const account = this.store.getAccount(this.currentId) ?? null
    if (!account) this.currentId = null
    return account
  }

  async register(input: unknown): Promise<AuthState & { recoveryKey?: string }> {
    const { username, password } = parseCredentials(input)
    const normalized = normalizeUsername(username)
    if (this.store.findAccount(normalized)) {
      throw new Error('An account with that username already exists.')
    }
    const firstAccount = this.store.listAccounts().length === 0
    const salt = randomBytes(SALT_BYTES)
    const hash = await scrypt(password, salt)
    const recoveryKey = generateRecoveryKey()
    const recoverySalt = randomBytes(SALT_BYTES)
    const recoveryHash = await scrypt(normalizeRecoveryKey(recoveryKey), recoverySalt)
    const account: LocalAccountRecord = {
      id: randomUUID(),
      username: normalized,
      salt: salt.toString('hex'),
      hash: hash.toString('hex'),
      createdAt: Date.now(),
      ...(firstAccount ? { primary: true } : {}),
      recoverySalt: recoverySalt.toString('hex'),
      recoveryHash: recoveryHash.toString('hex')
    }
    if (firstAccount) migrateLegacyData(this.store.baseDir, this.store.userDataDir(account.id))
    this.store.addAccount(account)
    this.currentId = account.id
    this.store.writeSession(account.id)
    // The plain-text recovery key leaves the service exactly once.
    return { ...this.getState(), recoveryKey }
  }

  async login(input: unknown): Promise<AuthState> {
    const { username, password } = parseCredentials(input)
    const account = this.store.findAccount(username)
    const salt = account ? Buffer.from(account.salt, 'hex') : randomBytes(SALT_BYTES)
    const candidate = await scrypt(password, salt)
    const expected = account ? Buffer.from(account.hash, 'hex') : Buffer.alloc(HASH_BYTES)
    const valid = Boolean(account) && candidate.length === expected.length && timingSafeEqual(candidate, expected)
    if (!valid || !account) throw new Error('Incorrect username or password.')
    this.currentId = account.id
    this.store.writeSession(account.id)
    return this.getState()
  }

  async logout(): Promise<AuthState> {
    this.currentId = null
    this.store.clearSession()
    return this.getState()
  }

  /** Forgot password: verify the recovery key, then store a fresh password hash and sign in. */
  async resetPassword(input: unknown): Promise<AuthState> {
    const { username, recoveryKey, password } = parseReset(input)
    const account = this.store.findAccount(username)
    if (!account) throw new Error('No account with that username.')
    if (!account.recoverySalt || !account.recoveryHash) {
      throw new Error('This account has no recovery key saved, so its password cannot be reset.')
    }
    const recoverySalt = Buffer.from(account.recoverySalt, 'hex')
    const candidate = await scrypt(normalizeRecoveryKey(recoveryKey), recoverySalt)
    const expected = Buffer.from(account.recoveryHash, 'hex')
    const valid = candidate.length === expected.length && timingSafeEqual(candidate, expected)
    if (!valid) throw new Error('That recovery key does not match this account.')
    const salt = randomBytes(SALT_BYTES)
    const hash = await scrypt(password, salt)
    this.store.updateAccount(account.id, {
      salt: salt.toString('hex'),
      hash: hash.toString('hex')
    })
    this.currentId = account.id
    this.store.writeSession(account.id)
    return this.getState()
  }
}
