import type {
  Automation,
  AutomationKind,
  AutomationPatch,
  RunMode,
  ScheduleType
} from '../../../../shared/contracts/automations.js'

/** Pure helpers for the Scheduled Tasks surfaces (unit-tested). */

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

export function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/** Every 15 minutes of the day, "HH:mm". */
export function timeOptions(step = 15): string[] {
  const options: string[] = []
  for (let minutes = 0; minutes < 24 * 60; minutes += step) {
    options.push(`${pad2(Math.floor(minutes / 60))}:${pad2(minutes % 60)}`)
  }
  return options
}

/** "10:00" -> "AM 10:00" (the picker shows 12h, the contract keeps 24h). */
export function pickerTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return time
  const suffix = hours >= 12 ? 'PM' : 'AM'
  const hour = hours % 12 === 0 ? 12 : hours % 12
  return `${suffix} ${hour}:${pad2(minutes)}`
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Oct 11, 2026" — fixed format, not locale dependent. */
export function formatDate(date?: string): string {
  if (!date) return '—'
  const [year, month, day] = date.split('-').map(Number)
  if (!year || !month || !day) return date
  return `${MONTH_NAMES[month - 1] ?? ''} ${day}, ${year}`
}

export function weekdayText(days?: number[]): string {
  if (!days || days.length === 0) return 'no days'
  return days.map((day) => WEEKDAY_LABELS[day] ?? '').join(', ')
}

/** The muted line under the card title. */
export function automationMeta(automation: Automation): string {
  if (automation.kind === 'advanced') return 'Advanced automation'
  const schedule = automation.schedule
  if (!schedule) return 'Schedule'
  switch (schedule.type) {
    case 'once':
      return `Schedule · ${formatDate(schedule.date)} at ${schedule.time}`
    case 'daily':
      return `Schedule · Repeat daily at ${schedule.time}`
    case 'weekly':
      return `Schedule · Repeat weekly on ${weekdayText(schedule.weekdays)} at ${schedule.time}`
    case 'monthly':
      return `Schedule · Repeat monthly on day ${schedule.dayOfMonth ?? 1} at ${schedule.time}`
  }
}

/** Manage filter menu: All plus the three ways an automation can run. */
export type ManageFilter = 'all' | 'schedule' | 'trigger' | 'canvas'

export const MANAGE_FILTERS: Array<{ id: ManageFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'trigger', label: 'Trigger' },
  { id: 'canvas', label: 'Canvas' }
]

/**
 * A triggered task is a scheduled run whose prompt watches an app event:
 * builder-compile writes `check @app for ...` into it. Canvases stay separate.
 * ponytail: prompt-text heuristic; switch to an explicit kind when one lands.
 */
export function manageFilterOf(automation: Automation): Exclude<ManageFilter, 'all'> {
  if (automation.kind === 'advanced') return 'canvas'
  if (/check\s+@[a-z-]+/i.test(automation.prompt ?? '')) return 'trigger'
  return 'schedule'
}

export function matchesManageFilter(automation: Automation, filter: ManageFilter): boolean {
  return filter === 'all' || manageFilterOf(automation) === filter
}

export interface AutomationDraft {
  title: string
  prompt: string
  scheduleType: ScheduleType
  time: string
  date: string
  weekdays: number[]
  autoApprove: boolean
  runMode: RunMode
  agent: string
  connectors: string[]
  expiresAt: string
}

export function draftFrom(automation: Automation): AutomationDraft {
  const schedule = automation.schedule
  return {
    title: automation.title,
    prompt: automation.prompt ?? '',
    scheduleType: schedule?.type ?? 'daily',
    time: schedule?.time ?? '10:00',
    date: schedule?.date ?? '',
    weekdays: [...(schedule?.weekdays ?? [])],
    autoApprove: automation.autoApprove,
    runMode: automation.runMode,
    agent: automation.agent,
    connectors: [...automation.connectors],
    expiresAt: automation.expiresAt ? automation.expiresAt.slice(0, 10) : ''
  }
}

export function isDirty(draft: AutomationDraft, original: AutomationDraft): boolean {
  return JSON.stringify(draft) !== JSON.stringify(original)
}

export function validateDraft(draft: AutomationDraft, kind: AutomationKind, now = Date.now()): string | null {
  if (!draft.title.trim()) return 'Add a title so this automation is easy to find.'
  if (kind === 'schedule' && !draft.prompt.trim()) return 'Add a prompt for the agent to run.'
  if (kind === 'schedule' && draft.scheduleType === 'once') {
    if (!draft.date) return 'Pick a date for this one-time task.'
    const endOfDay = new Date(`${draft.date}T23:59:59`).getTime()
    if (Number.isNaN(endOfDay) || endOfDay <= now) return 'Pick a date in the future.'
  }
  return null
}

export function draftToPatch(draft: AutomationDraft, kind: AutomationKind): AutomationPatch {
  const patch: AutomationPatch = {
    title: draft.title.trim(),
    prompt: draft.prompt,
    autoApprove: draft.autoApprove,
    runMode: draft.runMode,
    agent: draft.agent,
    connectors: draft.connectors,
    expiresAt: draft.expiresAt || null
  }
  if (kind === 'schedule') {
    patch.schedule = {
      type: draft.scheduleType,
      time: draft.time,
      ...(draft.scheduleType === 'once' ? { date: draft.date } : {}),
      ...(draft.scheduleType === 'weekly' ? { weekdays: [...draft.weekdays].sort((a, b) => a - b) } : {})
    }
  }
  return patch
}
