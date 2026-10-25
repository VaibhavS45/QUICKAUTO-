import { z } from 'zod'

/** Non-secret view of the account. Tokens never cross IPC. */
export const AuthStateSchema = z.object({
  signedIn: z.boolean(),
  /** False when no OAuth provider is configured (sign-in is unavailable). */
  configured: z.boolean(),
  name: z.string().optional(),
  email: z.string().optional(),
  avatarUrl: z.string().optional()
})
export type AuthState = z.infer<typeof AuthStateSchema>

export type AuthResult = { ok: true; state: AuthState } | { ok: false; error: string }
