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
  type: z.enum(['text', 'url', 'emails', 'sheet', 'time']),
  optional: z.boolean().optional()
})

export const AutomationTemplateStepSchema = z.object({
  trigger: AutomationTriggerSchema.optional(),
  prompt: z.string(),
  toolIds: z.array(z.string())
})

export const AutomationTemplateSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  trigger: AutomationTriggerSchema,
  prompt: z.string(),
  toolIds: z.array(z.string()),
  inputs: z.array(AutomationInputSchema),
  requires: z.array(z.string()),
  steps: z.array(AutomationTemplateStepSchema).optional()
})
export type AutomationTemplate = z.infer<typeof AutomationTemplateSchema>

export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  AutomationTemplateSchema.parse({
    id: 'daily-research-file-email',
    title: 'Daily research to file, then email',
    description: 'Research a topic every evening, append the findings to a file, then email when that file changes.',
    trigger: { kind: 'schedule', at: '20:00', repeat: 'daily' },
    prompt: 'At 20:00 each day, research the supplied topic and append the summary to the supplied text file. A separate file-changed trigger emails the new content to the supplied recipient.',
    toolIds: ['websearch', 'files', 'gmail'],
    inputs: [
      { key: 'topic', label: 'Research topic', type: 'text' },
      { key: 'filePath', label: 'Text file path', type: 'text' },
      { key: 'recipient', label: 'Email recipient', type: 'emails' }
    ],
    requires: ['websearch', 'files', 'gmail'],
    steps: [
      {
        prompt: 'Research the supplied topic with @websearch and append the summary to the supplied text file with @files.',
        toolIds: ['websearch', 'files']
      },
      {
        trigger: { kind: 'file-changed', path: '{{filePath}}' },
        prompt: 'Email the new file content to the supplied recipient with @gmail.',
        toolIds: ['gmail']
      }
    ]
  }),
  AutomationTemplateSchema.parse({
    id: 'meeting-reminder',
    title: 'Meeting reminder',
    description: 'Send a reminder 10 minutes before an event using a link and message you provide.',
    trigger: { kind: 'before-event', minutesBefore: 10 },
    prompt:
      'Ten minutes before the supplied event, email the supplied meeting link and reminder message to the supplied email recipients or Google Sheets range with @gmail and @sheets. The meeting link must be provided directly.',
    toolIds: ['gmail', 'sheets'],
    inputs: [
      { key: 'eventTime', label: 'Event time', type: 'time' },
      { key: 'meetingLink', label: 'Meeting link', type: 'url' },
      { key: 'message', label: 'Reminder message', type: 'text' },
      { key: 'emailRecipients', label: 'Email recipients (optional)', type: 'emails', optional: true },
      { key: 'sheetRange', label: 'Google Sheets range (optional)', type: 'sheet', optional: true }
    ],
    requires: ['gmail', 'sheets']
  }),
  AutomationTemplateSchema.parse({
    id: 'repo-watcher',
    title: 'Repo watcher',
    description: 'Review and summarize open pull requests in a repository every evening.',
    trigger: { kind: 'schedule', at: '18:00', repeat: 'daily' },
    prompt: 'At 18:00 each day, use @github to review and summarize open pull requests in the supplied owner/repository.',
    toolIds: ['github'],
    inputs: [{ key: 'repository', label: 'Owner / repository', type: 'text' }],
    requires: ['github']
  })
]

export const AutomationDefaultsSchema = z.object({
  approvalPolicy: z.enum(['ask', 'queue']),
  missedRunPolicy: z.enum(['run-once', 'skip']),
  notifyOnComplete: z.boolean()
})
export type AutomationDefaults = z.infer<typeof AutomationDefaultsSchema>
