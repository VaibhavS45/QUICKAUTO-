import { randomUUID } from 'node:crypto'

export interface InstallIdentityStore {
  get(key: string): unknown
  set(key: string, value: unknown): void
}

const INSTALL_ID_KEY = 'install-id'
const INSTALL_ID_RE = /^palette-[0-9a-f-]{36}$/i

export function isValidInstallId(value: unknown): value is string {
  return typeof value === 'string' && INSTALL_ID_RE.test(value)
}

export class InstallIdentityService {
  constructor(
    private readonly store: InstallIdentityStore,
    private readonly makeId: () => string = () => `palette-${randomUUID()}`
  ) {}

  getInstallId(): string {
    const existing = this.store.get(INSTALL_ID_KEY)
    if (isValidInstallId(existing)) return existing
    const created = this.makeId()
    if (!isValidInstallId(created)) throw new Error('Generated install id is invalid.')
    this.store.set(INSTALL_ID_KEY, created)
    return created
  }
}
