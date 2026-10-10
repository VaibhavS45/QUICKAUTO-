import { z } from 'zod'

export const TriggerKindSchema = z.enum(['schedule', 'file-changed', 'webhook', 'before-event'])
export type TriggerKind = z.infer<typeof TriggerKindSchema>

export const AutomationTriggerSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('schedule'), at: z.string().optional(), repeat: z.string().optional() }),
  z.object({ kind: z.literal('file-changed'), path: z.string().optional() }),
  z.object({ kind: z.literal('webhook'), path: z.string().optional() }),
  z.object({ kind: z.literal('before-event'), minutesBefore: z.number().nonnegative().optional() })
])

export const AutomationInputSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(['text', 'url', 'emails', 'sheet', 'time'])
})

export const AutomationTemplateSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  trigger: AutomationTriggerSchema,
  prompt: z.string(),
  toolIds: z.array(z.string()),
  inputs: z.array(AutomationInputSchema),
  requires: z.array(z.string())
})
export type AutomationTemplate = z.infer<typeof AutomationTemplateSchema>

export const AutomationDefaultsSchema = z.object({
  approvalPolicy: z.enum(['ask', 'queue']),
  missedRunPolicy: z.enum(['run-once', 'skip']),
  notifyOnComplete: z.boolean()
})
export type AutomationDefaults = z.infer<typeof AutomationDefaultsSchema>
