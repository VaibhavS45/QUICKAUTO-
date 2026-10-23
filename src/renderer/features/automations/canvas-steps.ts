import type { Automation, AutomationSchedule } from '../../../shared/contracts/automations.js'

export type CanvasKind = 'trigger' | 'action' | 'gmail' | 'filter' | 'delay'

export interface CanvasStep {
  id: string
  kind: CanvasKind
  title: string
  subtitle: string
  filled: boolean
  /** World coordinates on the n8n-style graph canvas. */
  pos: { x: number; y: number }
}
export interface CanvasRoutine {
  prompt: string
  tools: string[]
  runAt: number
  repeat: string
}

let seq = 0
export function makeStepId(): string {
  seq += 1
  return `step-${Date.now().toString(36)}-${seq}`
}

function timeLabelLocal(at: number): string {
  return new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function titleOf(prompt: string): string {
  const first = prompt.split('\n')[0] ?? prompt
  return first.length > 80 ? `${first.slice(0, 80)}…` : first
}

/** "9:00 AM" / "09:00" → "09:00". */
export function parseClock(text: string): string | null {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(text.trim())
  if (!m) return null
  let hours = Number(m[1])
  const minutes = m[2] ? Number(m[2]) : 0
  const ap = m[3]?.toLowerCase()
  if (ap === 'pm' && hours < 12) hours += 12
  if (ap === 'am' && hours === 12) hours = 0
  if (hours > 23 || minutes > 59) return null
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

/**
 * Read the trigger node back into a schedule. The node shows
 * "<type> · <time>", so an edited node can carry a new time or frequency.
 */
export function parseScheduleSummary(text: string, automation: Automation): AutomationSchedule | null {
  const [type, time] = text.split('·').map((part) => part.trim())
  const clock = parseClock(time ?? '')
  if (!clock) return null
  const current = automation.schedule
  const next = automation.nextRunAt ? new Date(automation.nextRunAt) : new Date()
  switch (type) {
    case 'once':
      return { type: 'once', time: clock, date: current?.type === 'once' && current.date ? current.date : localDate(next) }
    case 'weekly':
      return {
        type: 'weekly',
        time: clock,
        weekdays: current?.type === 'weekly' && current.weekdays?.length ? [...current.weekdays] : [next.getDay()]
      }
    case 'monthly':
      return {
        type: 'monthly',
        time: clock,
        dayOfMonth: current?.type === 'monthly' && current.dayOfMonth ? current.dayOfMonth : next.getDate()
      }
    case 'daily':
      return { type: 'daily', time: clock }
    default:
      return null
  }
}

function localDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** What the node edits mean for the automation they came from. */
export interface CanvasPatch {
  prompt?: string
  connectors?: string[]
  schedule?: AutomationSchedule
}

/**
 * The tool a connector node stands for. The title names the app (Gmail,
 * Sheets, GitHub); a generic node keeps its tool id in the subtitle.
 */
function toolOfStep(step: CanvasStep): string {
  const title = step.title.toLowerCase()
  if (step.kind === 'gmail' || /gmail|email/.test(title)) return 'gmail'
  if (/sheet/.test(title)) return 'sheets'
  if (/github/.test(title)) return 'github'
  if (/search/.test(title)) return 'websearch'
  return step.subtitle.trim()
}

/**
 * The edited nodes back onto the automation: the first action is the task, the
 * rest are the connectors, the trigger carries the schedule.
 */
export function canvasToPatch(steps: CanvasStep[], automation: Automation): CanvasPatch {
  const patch: CanvasPatch = {}
  const trigger = steps.find((step) => step.kind === 'trigger')
  const actions = steps.filter((step) => step.kind !== 'trigger')
  const prompt = actions[0]?.subtitle.trim() ?? ''
  if (prompt && prompt !== (automation.prompt ?? '')) patch.prompt = prompt
  const connectors = actions.slice(1).map(toolOfStep).filter(Boolean)
  if (connectors.join('|') !== automation.connectors.join('|')) patch.connectors = connectors
  if (trigger) {
    const schedule = parseScheduleSummary(trigger.subtitle, automation)
    if (schedule) patch.schedule = schedule
  }
  return patch
}

/** n8n-style graph metrics: compact node cards wired left → right. */
export const NODE_W = 208
export const NODE_H = 92
export const STEP_X = 272
export const ORIGIN = { x: 60, y: 260 }
export const WORLD = { w: 2400, h: 640 }

export function layoutPos(index: number): { x: number; y: number } {
  return { x: ORIGIN.x + index * STEP_X, y: ORIGIN.y }
}

/** Cubic bezier from the output handle of `from` to the input handle of `to`. */
export function edgePath(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const x1 = from.x + NODE_W
  const y1 = from.y + NODE_H / 2
  const x2 = to.x
  const y2 = to.y + NODE_H / 2
  const c = Math.max(48, (x2 - x1) / 2)
  return `M ${x1} ${y1} C ${x1 + c} ${y1}, ${x2 - c} ${y2}, ${x2} ${y2}`
}

/** Blank n8n-style starter: trigger wired to a short chain. */
export function defaultCanvasSteps(): CanvasStep[] {
  const kinds: CanvasKind[] = ['trigger', 'action', 'gmail', 'action']
  const titles = ['Trigger', 'Action', 'Gmail', 'Action']
  const subtitles = [
    'Select the trigger event',
    'Select the app and event',
    'Select the Gmail event',
    'Select the app and event'
  ]
  return kinds.map((kind, i) => ({
    id: makeStepId(),
    kind,
    title: titles[i]!,
    filled: kind === 'gmail',
    subtitle: subtitles[i]!,
    pos: layoutPos(i)
  }))
}

/** Derive editable canvas steps from a stored routine. */
export function canvasStepsForRoutine(routine: CanvasRoutine | undefined): CanvasStep[] {
  if (!routine) return defaultCanvasSteps()
  const steps: CanvasStep[] = [
    {
      id: makeStepId(),
      kind: 'trigger',
      title: 'Trigger',
      filled: true,
      subtitle: `${routine.repeat} · ${timeLabelLocal(routine.runAt)}`,
      pos: layoutPos(0)
    },
    { id: makeStepId(), kind: 'action', title: 'Action', filled: true, subtitle: titleOf(routine.prompt), pos: layoutPos(1) }
  ]
  for (const tool of routine.tools) {
    if (/gmail|email/i.test(tool)) {
      steps.push({ id: makeStepId(), kind: 'gmail', title: 'Gmail', filled: true, subtitle: titleOf(routine.prompt), pos: layoutPos(steps.length) })
    } else if (/sheet/i.test(tool)) {
      steps.push({ id: makeStepId(), kind: 'action', title: 'Sheets', filled: true, subtitle: tool, pos: layoutPos(steps.length) })
    } else if (/github/i.test(tool)) {
      steps.push({ id: makeStepId(), kind: 'action', title: 'GitHub', filled: true, subtitle: tool, pos: layoutPos(steps.length) })
    } else {
      steps.push({ id: makeStepId(), kind: 'action', title: 'Action', filled: true, subtitle: tool, pos: layoutPos(steps.length) })
    }
  }
  return steps
}

export function blankStep(kind: CanvasKind = 'action', pos?: { x: number; y: number }): CanvasStep {
  const title = kind === 'trigger' ? 'Trigger' : kind === 'gmail' ? 'Gmail' : kind === 'filter' ? 'Filter' : kind === 'delay' ? 'Delay' : 'Action'
  const subtitle =
    kind === 'trigger'
      ? 'Select the trigger event'
      : kind === 'filter'
        ? 'Only continue if conditions match'
        : kind === 'delay'
          ? 'Wait before running the next step'
          : 'Select the app and event'
  return { id: makeStepId(), kind, title, subtitle, filled: false, pos: pos ?? layoutPos(0) }
}

export function insertCanvasStep(steps: CanvasStep[], index: number, kind: CanvasKind = 'action', pos?: { x: number; y: number }): CanvasStep[] {
  const at = Math.max(0, Math.min(index, steps.length))
  if (pos) return [...steps.slice(0, at), blankStep(kind, pos), ...steps.slice(at)]
  // Make room: slide later nodes right so the new (empty) node never overlaps.
  const prev = steps[at - 1]
  const next = steps[at]
  const newPos = prev
    ? { x: prev.pos.x + STEP_X, y: prev.pos.y }
    : next
      ? { x: next.pos.x - STEP_X, y: next.pos.y }
      : layoutPos(0)
  const shifted = steps.map((s, i) => (i >= at ? { ...s, pos: { x: s.pos.x + STEP_X, y: s.pos.y } } : s))
  return [...shifted.slice(0, at), blankStep(kind, newPos), ...shifted.slice(at)]
}

/** Re-lay the chain left → right in order. Manual drags are kept until this runs. */
export function tidyCanvasSteps(steps: CanvasStep[]): CanvasStep[] {
  return steps.map((s, i) => ({ ...s, pos: layoutPos(i) }))
}

/** Free-drag a node to a world position, clamped to the canvas. */
export function moveStepTo(steps: CanvasStep[], id: string, x: number, y: number): CanvasStep[] {
  return steps.map((s) =>
    s.id === id
      ? { ...s, pos: { x: Math.max(0, Math.min(x, WORLD.w - NODE_W)), y: Math.max(0, Math.min(y, WORLD.h - NODE_H)) } }
      : s
  )
}

export function removeCanvasStep(steps: CanvasStep[], id: string): CanvasStep[] {
  if (steps.length <= 1) return steps
  return steps.filter((s) => s.id !== id)
}

export function moveCanvasStep(steps: CanvasStep[], id: string, delta: -1 | 1): CanvasStep[] {
  const i = steps.findIndex((s) => s.id === id)
  const j = i + delta
  if (i < 0 || j < 0 || j >= steps.length) return steps
  if (steps[i].kind === 'trigger' && j === 0 && delta === -1) return steps
  const next = [...steps]
  const [item] = next.splice(i, 1)
  next.splice(j, 0, item!)
  return next
}

export function updateCanvasStep(steps: CanvasStep[], id: string, patch: Partial<Pick<CanvasStep, 'kind' | 'title' | 'subtitle' | 'filled'>>): CanvasStep[] {
  return steps.map((s) => (s.id === id ? { ...s, ...patch, filled: true } : s))
}

/** Compose a routine prompt from canvas steps. Keeps @tool mentions so the scheduler picks up tools. */
export function canvasToPrompt(steps: CanvasStep[]): { text: string; tools: string[] } {
  const actions = steps.filter((s) => s.kind !== 'trigger')
  const toolTags = actions
    .map((s) => {
      const t = s.title.toLowerCase()
      if (s.kind === 'gmail' || /gmail|email/.test(t)) return '@gmail'
      if (/sheet/.test(t)) return '@sheets'
      if (/github/.test(t)) return '@github'
      if (/search/.test(t)) return '@websearch'
      if (/file|notion|code/.test(t)) return `@${/file/.test(t) ? 'files' : /notion/.test(t) ? 'notion' : 'opencode'}`
      return null
    })
    .filter((x): x is string => x !== null)
  const tools = [...new Set(toolTags)]
  const events = actions.map((s) => s.subtitle).filter((s) => s && !/^select the event/i.test(s))
  const text = [events.join('. ') || 'Run my automation', ...tools].join(' ').trim()
  return { text, tools: tools.map((t) => t.slice(1)) }
}

/** Compiles canvas steps into a scheduler-compatible routine prompt string with schedule phrase and @tool mentions. */
export function compileCanvasToSchedulerText(steps: CanvasStep[], title?: string): string {
  const trigger = steps.find((s) => s.kind === 'trigger')
  const actions = steps.filter((s) => s.kind !== 'trigger')
  const triggerText = trigger?.subtitle?.trim()
  let timePhrase = 'every day at 9:00am'
  if (triggerText && !/^select/i.test(triggerText)) {
    if (/(\d{1,2}:\d{2}|\d{1,2}\s*(am|pm))/i.test(triggerText)) {
      timePhrase = triggerText
    } else {
      timePhrase = `${triggerText} at 9:00am`
    }
  }

  const { text: actionText, tools } = canvasToPrompt(steps)
  const routineTitle = title?.trim() || actions[0]?.title || 'Automation'
  const toolTags = tools.map((t) => `@${t}`).join(' ')
  return `${routineTitle}. When: ${timePhrase}. ${actionText} ${toolTags}`.trim()
}

/** One-line advanced summary for Manage cards, e.g. "Advanced · daily · 6:30 PM · @gmail +1". */
export function describeRoutine(routine: CanvasRoutine): string {
  const advanced = routine.tools.length > 1
  const at = timeLabelLocal(routine.runAt)
  const first = routine.tools[0] ? `@${routine.tools[0]}` : 'no tools'
  const extra = routine.tools.length > 1 ? ` +${routine.tools.length - 1}` : ''
  return `${advanced ? 'Advanced' : 'Simple'} automation · ${routine.repeat} · ${at} · ${first}${extra}`
}
