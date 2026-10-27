import {
  AuthCredentialsSchema,
  type AuthCredentials,
  type AuthResult,
  type AuthState
} from '../../shared/contracts/auth.js'

export const AuthChannels = {
  getState: 'auth:get-state',
  signIn: 'auth:sign-in',
  signOut: 'auth:sign-out',
  login: 'auth:login',
  register: 'auth:register',
  changed: 'auth:changed'
} as const

type AuthInvoke =
  | typeof AuthChannels.getState
  | typeof AuthChannels.signIn
  | typeof AuthChannels.signOut
  | typeof AuthChannels.login
  | typeof AuthChannels.register

export interface AuthIpcRegistrar {
  handle(channel: AuthInvoke, listener: (_event: unknown, payload?: unknown) => unknown): void
}

export interface AuthPort {
  getState(): AuthState
  login(input: AuthCredentials): Promise<AuthState>
  register(input: AuthCredentials): Promise<AuthState>
  logout(): Promise<AuthState>
}

const message = (error: unknown): string => (error instanceof Error ? error.message : 'Sign-in failed.')

const readCredentials = (payload: unknown): AuthCredentials => {
  const parsed = AuthCredentialsSchema.safeParse(payload)
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? 'Invalid username or password.')
  }
  return parsed.data
}

export function registerAuthIpc(ipc: AuthIpcRegistrar, auth: AuthPort): void {
  const guard = (payload: unknown, run: () => Promise<AuthResult>): Promise<AuthResult> =>
    payload === undefined ? run() : Promise.resolve({ ok: false, error: 'Invalid request.' })

  ipc.handle(AuthChannels.getState, async (_event, payload) =>
    guard(payload, async () => ({ ok: true, state: auth.getState() })))

  ipc.handle(AuthChannels.signIn, (_event, payload) =>
    guard(payload, async () => ({ ok: false, error: 'Enter your username and password to sign in.' })))

  const credentials = (
    payload: unknown,
    run: (input: AuthCredentials) => Promise<AuthState>
  ): Promise<AuthResult> =>
    (async () => {
      try {
        return { ok: true, state: await run(readCredentials(payload)) }
      } catch (error) {
        return { ok: false, error: message(error) }
      }
    })()

  ipc.handle(AuthChannels.login, (_event, payload) => credentials(payload, (input) => auth.login(input)))

  ipc.handle(AuthChannels.register, (_event, payload) => credentials(payload, (input) => auth.register(input)))

  ipc.handle(AuthChannels.signOut, (_event, payload) =>
    guard(payload, async () => {
      try {
        return { ok: true, state: await auth.logout() }
      } catch (error) {
        return { ok: false, error: message(error) }
      }
    }))
}
