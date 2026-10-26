import { z } from 'zod'

/**
 * One file an automation run produced, as shown on the run detail page.
 * The bytes live on disk in the main process; this record is metadata only.
 */
export const RunArtifactSchema = z.object({
  id: z.string().min(1),
  runId: z.string().min(1),
  name: z.string().min(1).max(200),
  mime: z.string().max(120),
  size: z.number().int().nonnegative(),
  createdAt: z.number().int().nonnegative()
}).strict()

export type RunArtifact = z.infer<typeof RunArtifactSchema>
