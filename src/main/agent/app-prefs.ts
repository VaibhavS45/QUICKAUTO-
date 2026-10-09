import { z } from 'zod'

/**
 * App behavior prefs. Calendar-first: the calendar opens on launch and the
 * command bar + schedules stay available from there. When the calendar
 * window closes, `keepBackground` decides whether the palette/tray/scheduler
 * keep running (true, default) or the app quits.
 */
export const AppBehaviorSchema = z.object({
  keepBackground: z.boolean()
})
export type AppBehavior = z.infer<typeof AppBehaviorSchema>

export const DEFAULT_APP_BEHAVIOR: AppBehavior = { keepBackground: true }

/** Validate stored/ incoming prefs; fall back to defaults on any garbage. */
export function resolveAppBehavior(raw: unknown): AppBehavior {
  const parsed = AppBehaviorSchema.safeParse(raw)
  if (!parsed.success) return { ...DEFAULT_APP_BEHAVIOR }
  return parsed.data
}
