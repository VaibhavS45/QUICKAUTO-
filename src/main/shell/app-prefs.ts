import { z } from 'zod'

/**
 * App behavior prefs. The shell opens on launch and schedules stay available
 * from the tray. When the app window closes, `keepBackground` decides
 * whether the app/tray/scheduler keep running (true, default) or the app quits.
 *
 * Appearance (`shader`, `theme`) is non-secret UI chrome stored alongside.
 * `theme` is 'dark' (night), 'light' (day), or 'system' (follow the OS).
 */
export const AppThemeSchema = z.enum(['system', 'light', 'dark'])
export type AppTheme = z.infer<typeof AppThemeSchema>

export const AppBehaviorSchema = z.object({
  keepBackground: z.boolean(),
  shader: z.boolean(),
  theme: AppThemeSchema
})
export type AppBehavior = z.infer<typeof AppBehaviorSchema>

/** IPC patch: any field may be omitted; main merges onto stored prefs. */
export const AppBehaviorPatchSchema = z
  .object({
    keepBackground: z.boolean().optional(),
    shader: z.boolean().optional(),
    theme: AppThemeSchema.optional()
  })
  .refine(
    (v) => v.keepBackground !== undefined || v.shader !== undefined || v.theme !== undefined,
    'Empty patch.'
  )

export const DEFAULT_APP_BEHAVIOR: AppBehavior = { keepBackground: true, shader: true, theme: 'system' }

/** Validate stored / incoming prefs; fall back to defaults on any garbage. */
export function resolveAppBehavior(raw: unknown): AppBehavior {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_APP_BEHAVIOR }
  const o = raw as Record<string, unknown>
  return {
    keepBackground: typeof o.keepBackground === 'boolean' ? o.keepBackground : DEFAULT_APP_BEHAVIOR.keepBackground,
    shader: typeof o.shader === 'boolean' ? o.shader : DEFAULT_APP_BEHAVIOR.shader,
    theme: typeof o.theme === 'string' && (AppThemeSchema.safeParse(o.theme).success)
      ? (o.theme as AppTheme)
      : DEFAULT_APP_BEHAVIOR.theme
  }
}

export function applyAppBehaviorPatch(current: AppBehavior, patch: unknown): AppBehavior | null {
  const parsed = AppBehaviorPatchSchema.safeParse(patch)
  if (!parsed.success) return null
  return resolveAppBehavior({ ...current, ...parsed.data })
}
