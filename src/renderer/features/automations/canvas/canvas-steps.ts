import type { Automation, AutomationCreate, AutomationSchedule, CanvasStepRecord } from '../../../../shared/contracts/automations.js'
import { formatTime } from '../../../lib/format.js'
import { TRIGGER_APPS, triggerMention } from '../trigger/trigger-events.js'

export type CanvasKind = 'trigger' | 'action' | 'gmail' | 'filter' | 'delay' | 'opencode'

export interface CanvasStep {
  id: string
  kind: CanvasKind
  title: string
  subtitle: string
  filled: boolean
  /** World coordinates on the n8n-style graph canvas. */
  pos: { x: number; y: number }
  /** Step that feeds this one. Absent = the step before it in the array (legacy chain). */
  from?: string
  /** Label on the incoming edge, e.g. a condition's "Yes" / "No" branch. */
  branch?: string
  /** Selected trigger event phrase (e.g. 'a new email is received') */
  event?: string
  /** Parameter key-value pairs for trigger filters or action parameters */
  config?: Record<string, string>
  /** Detailed custom prompt instruction for this step */
  actionPrompt?: string
  /** Structured schedule object */
  schedule?: AutomationSchedule
}

/** The side of a node a new step branches out to. */
export type CanvasDirection = 'up' | 'right' | 'down' | 'left'
export interface CanvasRoutine {
  prompt: string
  tools: string[]
  runAt: number
  repeat: string
  /** The graph as drawn, when the automation stored it (additive). */
  steps?: CanvasStepRecord[]
}

let seq = 0
export function makeStepId(): string {
  seq += 1
  return `step-${Date.now().toString(36)}-${seq}`
}

function timeLabelLocal(at: number): string {
  return formatTime(at)
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

export type Repeat = 'daily' | 'weekly' | 'monthly' | 'once'

/** "weekly · 9:00 AM" or "When an email is received · daily · 09:00" → repeat + "HH:MM", the shape the trigger node stores. */
export function parseRepeatTime(text: string): { repeat: Repeat; time: string } {
  const parts = text.split('·').map((part) => part.trim())
  const validRepeats: Repeat[] = ['daily', 'weekly', 'monthly', 'once']
  const foundRepeat = parts.map((p) => p.toLowerCase()).find((p) => validRepeats.includes(p as Repeat))
  const repeat = (foundRepeat as Repeat) ?? 'daily'

  let time = '09:00'
  for (const part of parts) {
    const clock = parseClock(part)
    if (clock) {
      time = clock
      break
    }
  }
  return { repeat, time }
}

/**
 * Read the trigger node back into a schedule. The node shows
 * "<type> · <time>", so an edited node can carry a new time or frequency.
 */
export function parseScheduleSummary(text: string, automation: Automation): AutomationSchedule | null {
  const parts = text.split('·').map((part) => part.trim())
  let clock: string | null = null
  let type: string | undefined

  for (const part of parts) {
    const lower = part.toLowerCase()
    if (['daily', 'weekly', 'monthly', 'once'].includes(lower)) {
      type = lower
    }
    const parsedClock = parseClock(part)
    if (parsedClock) {
      clock = parsedClock
    }
  }

  if (!clock) return null
  const current = automation.schedule
  const next = automation.nextRunAt ? new Date(automation.nextRunAt) : new Date()
  switch (type ?? current?.type ?? 'daily') {
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
    default:
      return { type: 'daily', time: clock }
  }
}

function localDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/** The schedule a new automation starts with: the trigger node, anchored today. */
export function scheduleFromSteps(steps: CanvasStep[], now = new Date()): AutomationSchedule {
  const trigger = steps.find((step) => step.kind === 'trigger')
  if (trigger?.schedule) {
    return trigger.schedule
  }
  const { repeat, time } = parseRepeatTime(trigger?.subtitle ?? '')
  switch (repeat) {
    case 'once':
      return { type: 'once', time, date: localDate(now) }
    case 'weekly':
      return { type: 'weekly', time, weekdays: [now.getDay()] }
    case 'monthly':
      return { type: 'monthly', time, dayOfMonth: now.getDate() }
    default:
      return { type: 'daily', time }
  }
}

/** The graph as it will be stored: plain records the contracts accept. */
export function canvasToRecords(steps: CanvasStep[]): CanvasStepRecord[] {
  return steps.slice(0, 64).map((step) => ({
    id: step.id.slice(0, 64),
    kind: step.kind,
    title: step.title.slice(0, 120),
    subtitle: step.subtitle.slice(0, 2000),
    ...(step.filled !== undefined ? { filled: step.filled } : {}),
    pos: { x: step.pos.x, y: step.pos.y },
    ...(step.from ? { from: step.from.slice(0, 64) } : {}),
    ...(step.branch ? { branch: step.branch.slice(0, 64) } : {})
  }))
}

/** The canvas chain as a new automation, so it lands in Manage like any other. */
export function canvasToCreate(steps: CanvasStep[], title: string, now = new Date()): AutomationCreate {
  const { text, tools } = canvasToPrompt(steps)
  return {
    kind: 'advanced',
    title: title.trim().slice(0, 200) || 'New automation',
    prompt: (text || title).slice(0, 20000),
    schedule: scheduleFromSteps(steps, now),
    connectors: tools,
    canvasSteps: canvasToRecords(steps),
    autoApprove: false,
    runMode: 'separate_task',
    agent: ''
  }
}

/** The tool a connector node stands for, or '' when the step is logic. */
function toolOfStep(step: CanvasStep): string {
  // Logic steps shape the run; they are not connectors.
  if (step.kind === 'filter' || step.kind === 'delay') return ''
  const title = step.title.toLowerCase()
  if (step.kind === 'gmail' || /gmail|email/.test(title)) return 'gmail'
  if (/sheet/.test(title)) return 'sheets'
  if (/github/.test(title)) return 'github'
  if (/search/.test(title)) return 'websearch'
  if (/notion/.test(title)) return 'notion'
  if (/file/.test(title)) return 'files'
  if (/code/.test(title)) return 'opencode'
  if (/mcp/.test(title)) return 'mcp'
  const app = TRIGGER_APPS.find((a) => a.id === title || a.label.toLowerCase() === title)
  if (app) return triggerMention(app.id)
  // Known labels map onto real tool mentions; a bare sentence is never a
  // connector — an oversized one would invalidate the whole save patch.
  const fallback = step.subtitle.trim()
  if (!fallback || /^select /i.test(fallback)) return ''
  return fallback.length <= 64 ? fallback : fallback.slice(0, 64)
}

/**
 * The edited nodes back onto the automation: the first action is the task, the
 * rest are the connectors, the trigger carries the schedule. The drawn graph
 * itself is stored too, so reopening keeps every node as it was.
 */
export interface CanvasPatch {
  title?: string
  prompt?: string
  connectors?: string[]
  schedule?: AutomationSchedule
  canvasSteps?: CanvasStepRecord[]
}

/**
 * The edited nodes back onto the automation.
 */
export function canvasToPatch(steps: CanvasStep[], automation: Automation): CanvasPatch {
  const patch: CanvasPatch = {}
  const trigger = steps.find((step) => step.kind === 'trigger')
  const { text, tools } = canvasToPrompt(steps)
  const currentPrompt = automation.prompt?.trim() ?? ''
  const actions = steps.filter((step) => step.kind !== 'trigger')
  // Logic steps shape the flow; the task is the first real action.
  const promptStep = actions.find((step) => step.kind !== 'filter' && step.kind !== 'delay') ?? actions[0]

  const title = titleOf(promptStep?.subtitle.trim() ?? '')
  if (title && title !== automation.title) patch.title = title

  if (text && text !== currentPrompt) {
    const singleActionPrompt = promptStep?.subtitle.trim() ?? ''
    // If the canvas steps are simply the auto-derived 2-step routine that matches currentPrompt, skip patching prompt
    if (singleActionPrompt === currentPrompt && actions.length <= (automation.connectors?.length ? automation.connectors.length + 1 : 1)) {
      // Unmodified derived routine prompt
    } else {
      patch.prompt = text
    }
  }

  const currentConnectors = (automation.connectors ?? []).join('|')
  const newConnectors = tools.join('|')
  if (newConnectors && newConnectors !== currentConnectors) {
    const actionTools = actions.map(toolOfStep).filter(Boolean)
    if (actionTools.join('|') === currentConnectors) {
      // Unmodified derived connector list
    } else {
      patch.connectors = tools
    }
  }

  if (trigger) {
    const schedule = parseScheduleSummary(trigger.subtitle, automation)
    if (schedule) patch.schedule = schedule
  }
  const graph = canvasToRecords(steps)
  if (JSON.stringify(graph) !== JSON.stringify(automation.canvasSteps ?? [])) {
    patch.canvasSteps = graph
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

/** Cubic bezier from the nearest side of `from` to the nearest side of `to`. */
export function edgePath(from: { x: number; y: number }, to: { x: number; y: number }): string {
  const fromCx = from.x + NODE_W / 2
  const fromCy = from.y + NODE_H / 2
  const toCx = to.x + NODE_W / 2
  const toCy = to.y + NODE_H / 2
  const dx = toCx - fromCx
  const dy = toCy - fromCy
  if (Math.abs(dx) >= Math.abs(dy)) {
    const right = dx >= 0
    const x1 = right ? from.x + NODE_W : from.x
    const x2 = right ? to.x : to.x + NODE_W
    const y1 = fromCy
    const y2 = toCy
    const c = Math.max(40, Math.abs(x2 - x1) / 2) * (right ? 1 : -1)
    return `M ${x1} ${y1} C ${x1 + c} ${y1}, ${x2 - c} ${y2}, ${x2} ${y2}`
  }
  const down = dy >= 0
  const x1 = fromCx
  const x2 = toCx
  const y1 = down ? from.y + NODE_H : from.y
  const y2 = down ? to.y : to.y + NODE_H
  const c = Math.max(40, Math.abs(y2 - y1) / 2) * (down ? 1 : -1)
  return `M ${x1} ${y1} C ${x1} ${y1 + c}, ${x2} ${y2 - c}, ${x2} ${y2}`
}

/** Index of the step whose output feeds `steps[index]`; -1 when it is the trigger. */
export function edgeSourceIndex(steps: CanvasStep[], index: number): number {
  const from = steps[index]?.from
  if (!from) return index - 1
  return steps.findIndex((step) => step.id === from)
}

/** A condition fans out with two labelled outputs, every other step one. */
export function branchLabel(parent: CanvasStep, dir: CanvasDirection): string | undefined {
  if (parent.kind !== 'filter') return undefined
  if (dir === 'right') return 'Yes'
  if (dir === 'down') return 'No'
  return undefined
}

/** Where a node added from `parent` in `dir` lands, clear of the parent card. */
export function directionPos(parent: CanvasStep, dir: CanvasDirection): { x: number; y: number } {
  const gap = 64
  switch (dir) {
    case 'right':
      return { x: parent.pos.x + NODE_W + gap, y: parent.pos.y }
    case 'left':
      return { x: Math.max(0, parent.pos.x - NODE_W - gap), y: parent.pos.y }
    case 'down':
      return { x: parent.pos.x, y: parent.pos.y + NODE_H + gap }
    case 'up':
      return { x: parent.pos.x, y: Math.max(0, parent.pos.y - NODE_H - gap) }
  }
}

/** Add a step off any side of a node, wired back to it (conditions get Yes/No). */
export function insertFromDirection(
  steps: CanvasStep[],
  parentId: string,
  dir: CanvasDirection,
  kind: CanvasKind = 'action',
  preset?: { title?: string; subtitle?: string }
): CanvasStep[] {
  const index = steps.findIndex((step) => step.id === parentId)
  if (index < 0) return steps
  const parent = steps[index]!
  const step = blankStep(kind, directionPos(parent, dir))
  const label = branchLabel(parent, dir)
  const next: CanvasStep = {
    ...step,
    ...(preset?.title ? { title: preset.title } : {}),
    ...(preset?.subtitle ? { subtitle: preset.subtitle } : {}),
    from: parent.id,
    ...(label ? { branch: label } : {})
  }
  const ordered = [...steps]
  ordered.splice(index + 1, 0, next)
  return ordered
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
  // The stored graph wins: nodes reopen exactly as they were drawn.
  const stored = routine.steps
  if (stored?.length) {
    const steps: CanvasStep[] = stored.map((record) => ({
      id: record.id,
      kind: record.kind,
      title: record.title,
      subtitle: record.subtitle,
      filled: record.filled ?? true,
      pos: { x: record.pos.x, y: record.pos.y },
      ...(record.from ? { from: record.from } : {}),
      ...(record.branch ? { branch: record.branch } : {})
    }))
    return steps.length > 0 ? steps : defaultCanvasSteps()
  }
  const steps: CanvasStep[] = [
    {
      id: makeStepId(),
      kind: 'trigger',
      title: 'Trigger',
      filled: true,
      subtitle: `${routine.repeat} · ${timeLabelLocal(routine.runAt)}`,
      pos: layoutPos(0)
    },
    { id: makeStepId(), kind: 'action', title: 'Action', filled: true, subtitle: routine.prompt, pos: layoutPos(1) }
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

export function insertCanvasStep(
  steps: CanvasStep[],
  index: number,
  kind: CanvasKind = 'action',
  pos?: { x: number; y: number },
  preset?: { title?: string; subtitle?: string }
): CanvasStep[] {
  const at = Math.max(0, Math.min(index, steps.length))
  const make = (place?: { x: number; y: number }): CanvasStep => {
    const step = blankStep(kind, place)
    return preset ? { ...step, title: preset.title ?? step.title, subtitle: preset.subtitle ?? step.subtitle } : step
  }
  if (pos) return [...steps.slice(0, at), make(pos), ...steps.slice(at)]
  // Make room: slide later nodes right so the new (empty) node never overlaps.
  const prev = steps[at - 1]
  const next = steps[at]
  const newPos = prev
    ? { x: prev.pos.x + STEP_X, y: prev.pos.y }
    : next
      ? { x: next.pos.x - STEP_X, y: next.pos.y }
      : layoutPos(0)
  const shifted = steps.map((s, i) => (i >= at ? { ...s, pos: { x: s.pos.x + STEP_X, y: s.pos.y } } : s))
  return [...shifted.slice(0, at), make(newPos), ...shifted.slice(at)]
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
  const removed = steps.find((s) => s.id === id)
  return steps
    .filter((s) => s.id !== id)
    .map((s) => (s.from === id ? { ...s, from: removed?.from } : s))
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

export function updateCanvasStep(steps: CanvasStep[], id: string, patch: Partial<CanvasStep>): CanvasStep[] {
  return steps.map((s) => (s.id === id ? { ...s, ...patch, filled: true } : s))
}

/** Compose a routine prompt from canvas steps. Keeps @tool mentions so the scheduler picks up tools. */
export function canvasToPrompt(steps: CanvasStep[]): { text: string; tools: string[] } {
  const trigger = steps.find((s) => s.kind === 'trigger')
  const actions = steps.filter((s) => s.kind !== 'trigger')
  const toolTags: string[] = []

  // 1. Process trigger
  let triggerPrompt = ''
  if (trigger) {
    const rawTitle = trigger.title.trim().toLowerCase()
    const isSchedule = (/schedule|timer/i.test(rawTitle) || rawTitle === 'trigger') && !trigger.event
    if (!isSchedule) {
      const app = TRIGGER_APPS.find((a) => a.id === rawTitle || a.label.toLowerCase() === rawTitle)
      if (app) {
        const mention = triggerMention(app.id)
        toolTags.push(`@${mention}`)

        const eventPhrase = trigger.event || (trigger.subtitle.split('·')[0]?.trim() || '').replace(/^When /i, '') || 'an event occurs'
        const configEntries = Object.entries(trigger.config ?? {}).filter(([, v]) => v && v.trim())
        const configStr = configEntries.length > 0
          ? ` with config ${configEntries.map(([k, v]) => `${k}="${v.trim().replaceAll('"', '\\"')}"`).join(', ')}`
          : ''
        triggerPrompt = `check @${mention} for ${eventPhrase}${configStr}`
      }
    }
  }

  // 2. Process actions
  const actionPrompts = actions
    .map((s) => {
      const t = s.title.toLowerCase()
      let mention: string | null = null
      if (s.kind === 'gmail' || /gmail|email/.test(t)) mention = '@gmail'
      else if (/sheet/.test(t)) mention = '@sheets'
      else if (/github/.test(t)) mention = '@github'
      else if (/search/.test(t)) mention = '@websearch'
      else if (/file/.test(t)) mention = '@files'
      else if (/notion/.test(t)) mention = '@notion'
      else if (/code/.test(t)) mention = '@opencode'
      else if (/mcp/.test(t)) mention = '@mcp'
      else if (s.kind !== 'filter' && s.kind !== 'delay') {
        const app = TRIGGER_APPS.find((a) => a.id === t || a.label.toLowerCase() === t)
        if (app) mention = `@${triggerMention(app.id)}`
      }

      if (mention) toolTags.push(mention)

      const promptText = s.actionPrompt?.trim() || s.subtitle.trim()
      if (!promptText || /^select /i.test(promptText)) return null
      if (s.kind === 'filter') return `Only continue if: ${promptText}`
      if (s.kind === 'delay') return `Delay: ${promptText}`
      return promptText
    })
    .filter((x): x is string => x !== null)

  const tools = [...new Set(toolTags.map((t) => t.slice(1)))]
  const promptParts = [triggerPrompt, ...actionPrompts].filter(Boolean)
  const baseText = promptParts.join('. ') || 'Run my automation'
  const text = [baseText, ...new Set(toolTags)].filter(Boolean).join(' ').trim()

  return { text, tools }
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
