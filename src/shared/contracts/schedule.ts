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

export interface ScheduleSource {
  listForDay(date: string): Promise<ScheduleItem[]>
  listRecentRuns(limit: number): Promise<RunRecord[]>
  onChange(cb: () => void): () => void
}
