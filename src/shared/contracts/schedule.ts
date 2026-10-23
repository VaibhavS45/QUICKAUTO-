import { z } from 'zod'

export const ScheduleKindSchema = z.enum(['schedule', 'trigger', 'webhook'])
export const ScheduleStatusSchema = z.enum([
  'upcoming',
  'running',
  'done',
  'failed',
  'skipped',
  'waiting-approval'
])
export const RunStatusSchema = z.enum([
  'running',
  'succeeded',
  'failed',
  'cancelled',
  'waiting-approval',
  'skipped_budget'
])

export const ScheduleItemSchema = z.object({
  id: z.string().min(1),
  routineId: z.string().min(1).optional(),
  title: z.string(),
  kind: ScheduleKindSchema,
  at: z.number().int(),
  status: ScheduleStatusSchema,
  toolIds: z.array(z.string()),
  summary: z.string().optional()
})
export type ScheduleItem = z.infer<typeof ScheduleItemSchema>

export const RunRecordSchema = z.object({
  id: z.string().min(1),
  routineId: z.string().min(1).optional(),
  chatId: z.string().min(1).optional(),
  title: z.string(),
  startedAt: z.number().int(),
  endedAt: z.number().int().optional(),
  status: RunStatusSchema,
  summary: z.string().optional()
})
export type RunRecord = z.infer<typeof RunRecordSchema>

export const RunLogStatusSchema = z.enum(['running', 'succeeded', 'failed', 'skipped', 'missed'])
export type RunLogStatus = z.infer<typeof RunLogStatusSchema>

export const RunLogSourceSchema = z.enum(['schedule', 'trigger'])
export type RunLogSource = z.infer<typeof RunLogSourceSchema>

export const RunLogStepSchema = z.object({
  timestamp: z.number().int(),
  tool: z.string(),
  input: z.unknown().optional(),
  outputPreview: z.string().optional()
})
export type RunLogStep = z.infer<typeof RunLogStepSchema>

export const RunLogRecordSchema = z.object({
  runId: z.string().min(1),
  taskId: z.string().min(1),
  taskTitle: z.string(),
  sourceType: RunLogSourceSchema,
  scheduledFor: z.number().int().optional(),
  startedAt: z.number().int(),
  finishedAt: z.number().int().optional(),
  status: RunLogStatusSchema,
  currentStep: z.string().optional(),
  summary: z.string().optional(),
  error: z.string().optional(),
  steps: z.array(RunLogStepSchema).default([])
})
export type RunLogRecord = z.infer<typeof RunLogRecordSchema>

export const TodayScheduleSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`)
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  }),
  items: z.array(ScheduleItemSchema),
  done: z.number().int().nonnegative(),
  remaining: z.number().int().nonnegative()
})
export type TodaySchedule = z.infer<typeof TodayScheduleSchema>

export const UpdatesListRequestSchema = z.object({
  limit: z.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
  status: z.array(RunLogStatusSchema).optional(),
  sourceType: z.array(RunLogSourceSchema).optional(),
  task: z.string().optional(),
  from: z.number().int().optional(),
  to: z.number().int().optional()
}).strict()
export type UpdatesListRequest = z.infer<typeof UpdatesListRequestSchema>

export const UpdatesListResponseSchema = z.object({
  ok: z.literal(true),
  logs: z.array(RunLogRecordSchema),
  nextCursor: z.string().optional()
})
export type UpdatesListResponse = z.infer<typeof UpdatesListResponseSchema>

export interface ScheduleSource {
  listForDay(date: string): Promise<ScheduleItem[]>
  listRecentRuns(limit: number): Promise<RunRecord[]>
  onChange(cb: () => void): () => void
}

export interface RunLogRawStorage {
  load(): unknown
  save(records: RunLogRecord[]): void
}
