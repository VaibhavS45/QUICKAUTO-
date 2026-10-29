import { ipcRenderer } from 'electron'
import {
  AuthStateSchema,
  type AuthCredentials,
  type AuthResetCredentials,
  type AuthResult,
  type AuthState
} from '../shared/contracts/auth.js'

/** Account API. The renderer only ever sees name/email/avatar, never tokens or password hashes. */
export const authApi = {
  authGetState: (): Promise<AuthResult> => ipcRenderer.invoke('auth:get-state'),
  authSignIn: (): Promise<AuthResult> => ipcRenderer.invoke('auth:sign-in'),
  authSignOut: (): Promise<AuthResult> => ipcRenderer.invoke('auth:sign-out'),
  authLogin: (credentials: AuthCredentials): Promise<AuthResult> =>
    ipcRenderer.invoke('auth:login', credentials),
  authRegister: (credentials: AuthCredentials): Promise<AuthResult> =>
    ipcRenderer.invoke('auth:register', credentials),
  authResetPassword: (credentials: AuthResetCredentials): Promise<AuthResult> =>
    ipcRenderer.invoke('auth:reset-password', credentials),
  onAuthChanged: (cb: (state: AuthState) => void) => {
    const fn = (_event: unknown, payload: unknown): void => {
      const parsed = AuthStateSchema.safeParse(payload)
      if (parsed.success) cb(parsed.data)
    }
    ipcRenderer.on('auth:changed', fn)
    return () => {
      ipcRenderer.removeListener('auth:changed', fn)
    }
  }
}
