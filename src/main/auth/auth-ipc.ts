import type { AuthResult, AuthState } from '../../shared/contracts/auth.js'

export const AuthChannels = {
  getState: 'auth:get-state',
  signIn: 'auth:sign-in',
  signOut: 'auth:sign-out',
  changed: 'auth:changed'
} as const

type AuthInvoke = typeof AuthChannels.getState | typeof AuthChannels.signIn | typeof AuthChannels.signOut

export interface AuthIpcRegistrar {
  handle(channel: AuthInvoke, listener: (_event: unknown, payload?: unknown) => unknown): void
}

export interface AuthPort {
  getState(): AuthState
  signIn(): Promise<AuthState>
  signOut(): Promise<AuthState>
}

const message = (error: unknown): string => (error instanceof Error ? error.message : 'Sign-in failed.')

/** These channels take no arguments; any payload is rejected. */
export function registerAuthIpc(ipc: AuthIpcRegistrar, auth: AuthPort): void {
  const guard = (payload: unknown, run: () => Promise<AuthResult>): Promise<AuthResult> =>
    payload === undefined ? run() : Promise.resolve({ ok: false, error: 'Invalid request.' })

  ipc.handle(AuthChannels.getState, async (_event, payload) =>
    guard(payload, async () => ({ ok: true, state: auth.getState() })))
  ipc.handle(AuthChannels.signIn, (_event, payload) =>
    guard(payload, async () => {
      try {
        return { ok: true, state: await auth.signIn() }
      } catch (error) {
        return { ok: false, error: message(error) }
      }
    }))
  ipc.handle(AuthChannels.signOut, (_event, payload) =>
    guard(payload, async () => {
      try {
        return { ok: true, state: await auth.signOut() }
      } catch (error) {
        return { ok: false, error: message(error) }
      }
    }))
}
