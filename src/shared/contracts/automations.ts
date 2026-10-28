import { z } from 'zod'

/**
 * Scheduled Tasks contract. Additive: the stored routine shape stays the
 * source of truth, this is the view model the renderer edits.
 */
export const AutomationKindSchema = z.enum(['schedule', 'advanced'])
export type AutomationKind = z.infer<typeof AutomationKindSchema>

export const AutomationStatusSchema = z.enum(['active', 'paused'])
export type AutomationStatus = z.infer<typeof AutomationStatusSchema>

export const ScheduleTypeSchema = z.enum(['once', 'daily', 'weekly', 'monthly'])
export type ScheduleType = z.infer<typeof ScheduleTypeSchema>

export const RunModeSchema = z.enum(['separate_task', 'same_task'])
export type RunMode = z.infer<typeof RunModeSchema>

/** 24h "HH:mm" in the user's local timezone. */
export const ClockTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/)
export const IsoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

export const AutomationScheduleSchema = z.object({
  type: ScheduleTypeSchema,
  time: ClockTimeSchema,
  /** ISO date, for "once". */
  date: IsoDateSchema.optional(),
  /** 0 = Sunday. For "weekly". */
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  /** Day of the month (1-31), for "monthly". */
  dayOfMonth: z.number().int().min(1).max(31).optional()
})
export type AutomationSchedule = z.infer<typeof AutomationScheduleSchema>

/** One node of a canvas-built automation, stored so reopening is lossless. */
export const CanvasStepSchema = z.object({
  id: z.string().min(1).max(64),
  kind: z.enum(['trigger', 'action', 'gmail', 'filter', 'delay', 'opencode']),
  title: z.string().max(120),
  subtitle: z.string().max(2000),
  filled: z.boolean().optional(),
  pos: z.object({ x: z.number(), y: z.number() }),
  /** Step that feeds this one. Absent = the step before it (legacy chain). */
  from: z.string().max(64).optional(),
  /** Label on the incoming edge, e.g. a condition's "Yes" / "No" branch. */
  branch: z.string().max(64).optional()
})
export type CanvasStepRecord = z.infer<typeof CanvasStepSchema>

export const AutomationSchema = z.object({
  id: z.string().min(1).max(128),
  kind: AutomationKindSchema,
  title: z.string().max(200),
  /** Never concatenated with the title. Unused for "advanced". */
  prompt: z.string().max(20000).optional(),
  status: AutomationStatusSchema,
  schedule: AutomationScheduleSchema.optional(),
  autoApprove: z.boolean(),
  runMode: RunModeSchema,
  agent: z.string().max(120),
  connectors: z.array(z.string().max(64)).max(32),
  projectId: z.string().max(120).optional(),
  localFolder: z.string().max(512).optional(),
  cloudComputerId: z.string().max(120).optional(),
  expiresAt: z.string().max(40).optional(),
  createdAt: z.string().max(40),
  lastRunAt: z.string().max(40).optional(),
  /** Computed server-side from the schedule. */
  nextRunAt: z.string().max(40).optional(),
  /** Canvas nodes as drawn (additive). Present when the graph was opened. */
  canvasSteps: z.array(CanvasStepSchema).max(64).optional()
})
export type Automation = z.infer<typeof AutomationSchema>

export const AutomationCreateSchema = z.object({
  kind: AutomationKindSchema.default('schedule'),
  title: z.string().min(1).max(200),
  prompt: z.string().max(20000).optional(),
  schedule: AutomationScheduleSchema.optional(),
  autoApprove: z.boolean().default(false),
  runMode: RunModeSchema.default('separate_task'),
  agent: z.string().max(120).default(''),
  connectors: z.array(z.string().max(64)).max(32).default([]),
  expiresAt: z.string().max(40).optional(),
  /** Canvas nodes as drawn, so the graph reopens exactly as edited (additive). */
  canvasSteps: z.array(CanvasStepSchema).max(64).optional()
})
export type AutomationCreate = z.infer<typeof AutomationCreateSchema>

export const AutomationPatchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  prompt: z.string().max(20000).optional(),
  kind: AutomationKindSchema.optional(),
  schedule: AutomationScheduleSchema.optional(),
  autoApprove: z.boolean().optional(),
  runMode: RunModeSchema.optional(),
  agent: z.string().max(120).optional(),
  connectors: z.array(z.string().max(64)).max(32).optional(),
  /** Canvas nodes as drawn (additive) — whole-graph replace on update. */
  canvasSteps: z.array(CanvasStepSchema).max(64).optional(),
  /** null clears the expiration date. */
  expiresAt: z.string().max(40).nullable().optional()
})
export type AutomationPatch = z.infer<typeof AutomationPatchSchema>
