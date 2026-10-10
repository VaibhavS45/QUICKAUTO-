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

/** One-line advanced summary for Manage cards, e.g. "Advanced · daily · 6:30 PM · @gmail +1". */
export function describeRoutine(routine: CanvasRoutine): string {
  const advanced = routine.tools.length > 1
  const at = timeLabelLocal(routine.runAt)
  const first = routine.tools[0] ? `@${routine.tools[0]}` : 'no tools'
  const extra = routine.tools.length > 1 ? ` +${routine.tools.length - 1}` : ''
  return `${advanced ? 'Advanced' : 'Simple'} automation · ${routine.repeat} · ${at} · ${first}${extra}`
}
