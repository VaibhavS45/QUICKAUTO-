import type { AutomationTemplate } from '../../../../shared/contracts/automation-templates.js'
import type { AutomationCreate, AutomationSchedule, ScheduleType } from '../../../../shared/contracts/automations.js'
import { triggerMention } from '../trigger/trigger-events.js'

/** The schedule types the contract supports. */
export type BuilderRepeat = ScheduleType
export type BuilderTriggerKind = 'schedule' | 'event'

export interface BuilderTrigger {
  id: string
  kind: BuilderTriggerKind
  repeat: BuilderRepeat
  /** 24h HH:MM */
  time: string
  /** ISO date (YYYY-MM-DD), for "once" */
  date: string
  /** 0 = Sunday, for "weekly" */
  weekdays: number[]
  /** Day of the month (1-31), for "monthly" */
  dayOfMonth: number
  /** tool id for event triggers */
  app: string
  /** what to watch for (event triggers) */
  event: string
  /** Composio trigger config params (query, labelIds, owner, repo, …) folded into the event check */
  config?: Record<string, string>
}

export interface BuilderDraft {
  title: string
  triggers: BuilderTrigger[]
  task: string
  /** Connector ids the task may use. */
  tools: string[]
  /** Agent profile id that runs the task. */
  agent: string
}

let seq = 0
export function makeTriggerId(): string {
  seq += 1
  return `trig-${Date.now().toString(36)}-${seq}`
}

export function blankTrigger(kind: BuilderTriggerKind = 'schedule'): BuilderTrigger {
  return {
    id: makeTriggerId(),
    kind,
    repeat: 'daily',
    time: '09:00',
    date: '',
    weekdays: [],
    dayOfMonth: new Date().getDate(),
    app: 'gmail',
    event: '',
    config: {}
  }
}

export function blankDraft(): BuilderDraft {
  return { title: '', triggers: [blankTrigger()], task: '', tools: [], agent: '' }
}

function mentionsIn(text: string): string[] {
  return [...text.matchAll(/(?:^|\s)@([a-zA-Z]+)/g)].map((m) => m[1]!.toLowerCase())
}

/** Strip @tool tags so they never show in inputs; ids travel via draft.tools instead. */
export function stripMentions(text: string): string {
  return text.replace(/(?:^|\s)@[a-zA-Z]+/g, ' ').replace(/\s+/g, ' ').trim()
}

export interface CompiledAutomation {
  create: AutomationCreate | null
  valid: boolean
  error: string
}

function fail(error: string): CompiledAutomation {
  return { create: null, valid: false, error }
}

/** The schedule a trigger describes: the first one wins, event triggers are checks. */
function scheduleOf(trigger: BuilderTrigger): AutomationSchedule | { error: string } {
  if (!/^\d{2}:\d{2}$/.test(trigger.time)) return { error: 'Pick a valid time.' }
  switch (trigger.repeat) {
    case 'once':
      if (!/^\d{4}-\d{2}-\d{2}$/.test(trigger.date)) return { error: 'Pick a date for this one-time task.' }
      return { type: 'once', time: trigger.time, date: trigger.date }
    case 'weekly':
      if (trigger.weekdays.length === 0) return { error: 'Pick at least one day of the week.' }
      return { type: 'weekly', time: trigger.time, weekdays: [...trigger.weekdays].sort((a, b) => a - b) }
    case 'monthly':
      return { type: 'monthly', time: trigger.time, dayOfMonth: trigger.dayOfMonth }
    default:
      return { type: 'daily', time: trigger.time }
  }
}

/** A short, human title for a task that has none. */
export function titleFromTask(task: string): string {
  const first = task.split(/[.\n]/)[0]?.trim() ?? task.trim()
  return first.length > 80 ? `${first.slice(0, 80)}…` : first
}

/**
 * The builder's picks → the contract payload. The choices travel as data, so
 * the stored automation is the one the form shows instead of a sentence the
 * backend has to re-guess.
 */
export function draftToAutomation(draft: BuilderDraft): CompiledAutomation {
  const title = draft.title.trim()
  const task = draft.task.trim()
  if (draft.triggers.length === 0) return fail('Add at least one trigger.')

  const primary = draft.triggers.find((t) => t.kind === 'schedule') ?? draft.triggers[0]!
  const schedule = scheduleOf(primary)
  if ('error' in schedule) return fail(schedule.error)

  const eventPhrases = draft.triggers
    .filter((t) => t.kind === 'event' && t.app && t.event.trim())
    .map((t) => {
      const config = Object.entries(t.config ?? {}).filter(([, value]) => value.trim())
      const filters = config
        .map(([key, value]) => `${key}="${value.trim().replaceAll('"', '\\"')}"`)
        .join(', ')
      return `check @${triggerMention(t.app)} for ${t.event.trim()}${filters ? ` with config ${filters}` : ''}`
    })
  const prompt = [task, ...eventPhrases].filter(Boolean).join('. ')
  if (!prompt.trim()) return fail('Describe what the agent should do.')

  const connectors = [...new Set([
    ...draft.tools.map((t) => t.trim().toLowerCase()).filter(Boolean),
    ...mentionsIn(prompt)
  ])]

  const create: AutomationCreate = {
    kind: 'schedule',
    title: title || titleFromTask(prompt),
    prompt,
    schedule,
    // Scheduled runs never write, so nothing is auto-approved here.
    autoApprove: false,
    runMode: 'separate_task',
    agent: draft.agent,
    connectors
  }
  return { create, valid: true, error: '' }
}

function repeatFromTemplate(repeat?: string): BuilderRepeat {
  if (/weekday/i.test(repeat ?? '')) return 'weekly'
  if (/daily|every day/i.test(repeat ?? '')) return 'daily'
  if (/month/i.test(repeat ?? '')) return 'monthly'
  return 'once'
}

/** Template → editable manual draft. @tags are stripped from the visible task; ids travel via draft.tools. */
export function templateToDraft(template: AutomationTemplate): BuilderDraft {
  const trigger = template.trigger
  const triggers: BuilderTrigger[] =
    trigger.kind === 'schedule'
      ? [{
        ...blankTrigger('schedule'),
        repeat: repeatFromTemplate(trigger.repeat),
        time: /^\d{1,2}:\d{2}$/.test(trigger.at ?? '') ? trigger.at! : '18:00',
        weekdays: [1, 2, 3, 4, 5]
      }]
      : [{ ...blankTrigger('event'), app: template.toolIds[0] ?? 'gmail', event: template.description }]
  const tools = [...new Set([...mentionsIn(template.prompt), ...template.toolIds.map((id) => id.toLowerCase())])]
  const task = stripMentions(template.prompt)
  return { title: template.title, triggers, task, tools, agent: '' }
}
