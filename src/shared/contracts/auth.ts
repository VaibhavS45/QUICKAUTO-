import { z } from 'zod'

/** Non-secret view of the account. Tokens never cross IPC. */
export const AuthStateSchema = z.object({
  signedIn: z.boolean(),
  /** False when sign-in is unavailable on this system. */
  configured: z.boolean(),
  name: z.string().optional(),
  email: z.string().optional(),
  avatarUrl: z.string().optional(),
  hasAccounts: z.boolean().optional(),
  method: z.enum(['local', 'oauth']).optional()
})
export type AuthState = z.infer<typeof AuthStateSchema>

export const AuthCredentialsSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters.')
    .max(32, 'Username must be 32 characters or fewer.')
    .regex(/^[a-z0-9._-]+$/i, 'Use letters, numbers, dots, dashes, or underscores.'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters.')
    .max(200, 'Password must be 200 characters or fewer.')
})
export type AuthCredentials = z.infer<typeof AuthCredentialsSchema>

export type AuthResult = { ok: true; state: AuthState } | { ok: false; error: string }
