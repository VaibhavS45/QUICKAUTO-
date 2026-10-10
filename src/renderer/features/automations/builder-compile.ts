import type { AutomationTemplate } from '../../../shared/contracts/automation-templates.js'

export type BuilderRepeat = 'once' | 'daily' | 'weekdays'
export type BuilderTriggerKind = 'schedule' | 'event'

export interface BuilderTrigger {
  id: string
  kind: BuilderTriggerKind
  repeat: BuilderRepeat
  /** 24h HH:MM */
  time: string
  /** tool id for event triggers */
  app: string
  /** what to watch for (event triggers) */
  event: string
}

export interface BuilderDraft {
  mode: 'manual' | 'describe'
  title: string
  triggers: BuilderTrigger[]
  task: string
  describe: string
}

let seq = 0
export function makeTriggerId(): string {
  seq += 1
  return `trig-${Date.now().toString(36)}-${seq}`
}

export function blankTrigger(kind: BuilderTriggerKind = 'schedule'): BuilderTrigger {
  return { id: makeTriggerId(), kind, repeat: 'daily', time: '09:00', app: 'gmail', event: '' }
}

export function blankDraft(): BuilderDraft {
  return { mode: 'manual', title: '', triggers: [blankTrigger()], task: '', describe: '' }
}

/** HH:MM → "6:30pm" so Scheduler.create finds the time. */
export function toAmPm(time: string): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim())
  if (!m) return null
  const h = parseInt(m[1]!, 10)
  const min = parseInt(m[2]!, 10)
  if (h > 23 || min > 59) return null
  const ap = h >= 12 ? 'pm' : 'am'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(min).padStart(2, '0')}${ap}`
}

function repeatWord(repeat: BuilderRepeat): string {
  return repeat === 'once' ? 'tomorrow' : repeat === 'weekdays' ? 'weekdays' : 'every day'
}

/** One trigger → one English phrase the scheduler parses (time + repeat + app). */
export function triggerToPhrase(trigger: BuilderTrigger): string | null {
  const at = toAmPm(trigger.time)
  if (!at) return null
  const when = `${repeatWord(trigger.repeat)} at ${at}`
  if (trigger.kind === 'schedule') return when
  if (!trigger.app || !trigger.event.trim()) return null
  return `${when}, check @${trigger.app} for ${trigger.event.trim()}`
}

function mentionsIn(text: string): string[] {
  return [...text.matchAll(/(?:^|\s)@([a-zA-Z]+)/g)].map((m) => m[1]!.toLowerCase())
}

export interface CompiledDraft {
  text: string
  tools: string[]
  valid: boolean
  error: string
}

export function draftToText(draft: BuilderDraft): CompiledDraft {
  if (draft.mode === 'describe') {
    const text = draft.describe.trim()
    if (!text) return { text: '', tools: [], valid: false, error: 'Describe the automation first.' }
    return { text, tools: [...new Set(mentionsIn(text))], valid: true, error: '' }
  }
  if (draft.triggers.length === 0) return { text: '', tools: [], valid: false, error: 'Add at least one trigger.' }
  const phrases: string[] = []
  for (const [i, t] of draft.triggers.entries()) {
    const phrase = triggerToPhrase(t)
    if (!phrase) {
      return {
        text: '',
        tools: [],
        valid: false,
        error: t.kind === 'event' ? `Trigger ${i + 1} needs an app and something to watch for.` : `Trigger ${i + 1} needs a valid time.`
      }
    }
    phrases.push(phrase)
  }
  if (!draft.title.trim() && !draft.task.trim()) {
    return { text: '', tools: [], valid: false, error: 'Give it a title or describe what the agent should do.' }
  }
  const appTags = draft.triggers.filter((t) => t.kind === 'event').map((t) => `@${t.app}`)
  const text = [draft.title.trim(), `When: ${phrases.join('; ')}`, draft.task.trim(), ...appTags]
    .filter(Boolean)
    .join('. ')
  return { text, tools: [...new Set([...mentionsIn(text)])], valid: true, error: '' }
}

function repeatFromTemplate(repeat?: string): BuilderRepeat {
  if (/weekday/i.test(repeat ?? '')) return 'weekdays'
  if (/daily|day/i.test(repeat ?? '')) return 'daily'
  return 'once'
}

/** Template → editable manual draft, keeping its @tool mentions so tools carry over. */
export function templateToDraft(template: AutomationTemplate): BuilderDraft {
  const trigger = template.trigger
  const triggers: BuilderTrigger[] =
    trigger.kind === 'schedule'
      ? [{ ...blankTrigger('schedule'), repeat: repeatFromTemplate(trigger.repeat), time: /^\d{1,2}:\d{2}$/.test(trigger.at ?? '') ? trigger.at! : '18:00' }]
      : [{ ...blankTrigger('event'), app: template.toolIds[0] ?? 'gmail', event: template.description }]
  const have = new Set(mentionsIn(template.prompt))
  const missing = template.toolIds.filter((id) => !have.has(id.toLowerCase()))
  const task = [template.prompt, ...missing.map((id) => `@${id}`)].join(' ').trim()
  return { mode: 'manual', title: template.title, triggers, task, describe: '' }
}
