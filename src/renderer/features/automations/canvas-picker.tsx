import { useState } from 'react'
import { Boxes, Clock, Filter, FolderOpen, Globe, Plug, Table2, Terminal, Zap, type LucideIcon } from 'lucide-react'
import { TOOL_IDS, TOOL_META } from '../../../shared/types.js'
import { formatTime } from '../../lib/format.js'
import { TIMER_TRIGGER, TRIGGER_APPS, triggerApp } from './trigger-events.js'
import { TriggerAppIcon } from './trigger-icons.js'
import { parseClock, type CanvasKind, type CanvasStep } from './canvas-steps.js'

/** One row of the add-step picker: what it adds and the node it creates. */
export interface CanvasPick {
  id: string
  label: string
  hint: string
  kind: CanvasKind
  title: string
  subtitle: string
}

export type CanvasPickTarget = 'trigger' | 'step'

const PLACEHOLDER = 'Select the app and event'

/** What starts the workflow. Picking one retargets the existing trigger node. */
export const TRIGGER_PICKS: CanvasPick[] = [
  {
    id: TIMER_TRIGGER.id,
    label: 'Schedule',
    hint: 'Run at the time you choose',
    kind: 'trigger',
    title: 'Schedule',
    subtitle: 'Select the trigger event'
  },
  ...TRIGGER_APPS.map((app) => ({
    id: app.id,
    label: app.label,
    hint: `On app activity · ${app.events.length} events`,
    kind: 'trigger' as CanvasKind,
    title: app.label,
    subtitle: 'Select the trigger event'
  }))
]

/** The tools an automation can use, one row each. */
export const ACTION_PICKS: CanvasPick[] = TOOL_IDS.map((id) => {
  const meta = TOOL_META[id]
  const label = meta.label.replace(/^@/, '')
  return {
    id,
    label: label.charAt(0).toUpperCase() + label.slice(1),
    hint: meta.hint,
    kind: id === 'gmail' ? 'gmail' as CanvasKind : 'action' as CanvasKind,
    title: label.charAt(0).toUpperCase() + label.slice(1),
    subtitle: PLACEHOLDER
  }
})

/** Steps that are not an app: the agent, a condition, a wait. */
export const LOGIC_PICKS: CanvasPick[] = [
  {
    id: 'agent',
    label: 'Agent action',
    hint: 'Let the agent decide what to do',
    kind: 'action',
    title: 'Action',
    subtitle: PLACEHOLDER
  },
  {
    id: 'filter',
    label: 'Filter',
    hint: 'Only continue if conditions match',
    kind: 'filter',
    title: 'Filter',
    subtitle: 'Only continue if conditions match'
  },
  {
    id: 'delay',
    label: 'Delay',
    hint: 'Wait before running the next step',
    kind: 'delay',
    title: 'Delay',
    subtitle: 'Wait before running the next step'
  }
]

/** Case-insensitive label/hint search (pure, unit-tested). */
export function filterPicks(picks: CanvasPick[], query: string): CanvasPick[] {
  const q = query.trim().toLowerCase()
  if (!q) return picks
  return picks.filter((pick) => `${pick.label} ${pick.hint}`.toLowerCase().includes(q))
}

const TOOL_ICONS: Record<string, LucideIcon> = {
  websearch: Globe,
  composio: Boxes,
  sheets: Table2,
  files: FolderOpen,
  opencode: Terminal,
  mcp: Plug
}

function iconFor(id: string, kind: CanvasKind, size: number): React.JSX.Element {
  if (id === TIMER_TRIGGER.id) return <Clock size={size} strokeWidth={1.75} aria-hidden="true" />
  if (kind === 'filter') return <Filter size={size} strokeWidth={1.75} aria-hidden="true" />
  if (kind === 'delay') return <Clock size={size} strokeWidth={1.75} aria-hidden="true" />
  const app = triggerApp(id)
  if (app) return <TriggerAppIcon app={app} size={size} />
  const Icon = TOOL_ICONS[id] ?? Zap
  return <Icon size={size} strokeWidth={1.75} aria-hidden="true" />
}

/** The 30px icon on a canvas node: brand logo when the step names an app. */
export function CanvasNodeIcon({ step }: { step: Pick<CanvasStep, 'kind' | 'title'> }): React.JSX.Element {
  const key = step.title.trim().toLowerCase()
  const app = TRIGGER_APPS.find((candidate) => candidate.id === key || candidate.label.toLowerCase() === key)
  if (app) return <TriggerAppIcon app={app} size={18} />
  return iconFor(key, step.kind, 16)
}

/**
 * Add-step panel, n8n style: search on top, then the two operations a workflow
 * has — what starts it, and what it does.
 */
export function CanvasStepPicker({ onPick, onClose, ariaLabel, zoom = 1 }: {
  onPick(target: CanvasPickTarget, pick: CanvasPick): void
  onClose(): void
  ariaLabel: string
  zoom?: number
}): React.JSX.Element {
  const [tab, setTab] = useState<CanvasPickTarget>('step')
  const [query, setQuery] = useState('')

  const rows = (target: CanvasPickTarget): CanvasPick[] => {
    const picks = target === 'trigger' ? TRIGGER_PICKS : [...ACTION_PICKS, ...LOGIC_PICKS]
    return filterPicks(picks, query)
  }

  const section = (title: string, picks: CanvasPick[]): React.JSX.Element | null => {
    if (!picks.length) return null
    return (
      <section className="n8n-pick-group">
        <h4>{title}</h4>
        {picks.map((pick) => (
          <button
            key={`${title}-${pick.id}`}
            type="button"
            className="n8n-pick-row"
            onClick={() => onPick(tab, pick)}
          >
            <span className="n8n-pick-icon" aria-hidden="true">
              {iconFor(pick.id, pick.kind, 18)}
            </span>
            <span className="n8n-pick-text">
              <strong>{pick.label}</strong>
              <small>{pick.hint}</small>
            </span>
          </button>
        ))}
      </section>
    )
  }

  const visible = rows(tab)

  return (
    <div
      className="n8n-picker"
      role="dialog"
      aria-label={ariaLabel}
      style={{ '--pick-scale': Math.min(2.4, 1 / Math.max(zoom, 0.2)) } as React.CSSProperties}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="n8n-picker-tabs" role="tablist" aria-label="Step type">
        <button type="button" role="tab" aria-selected={tab === 'trigger'} onClick={() => setTab('trigger')}>
          Trigger
        </button>
        <button type="button" role="tab" aria-selected={tab === 'step'} onClick={() => setTab('step')}>
          Action
        </button>
      </div>
      <input
        className="n8n-picker-search"
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
        placeholder={tab === 'trigger' ? 'Search triggers' : 'Search apps and steps'}
        aria-label={tab === 'trigger' ? 'Search triggers' : 'Search apps and steps'}
      />
      <div className="n8n-picker-body">
        {tab === 'trigger'
          ? section('Starts the workflow', visible)
          : (
            <>
              {section('Apps', filterPicks(ACTION_PICKS, query))}
              {section('Logic', filterPicks(LOGIC_PICKS, query))}
            </>
          )}
        {visible.length === 0 && <p className="n8n-pick-empty">No matches.</p>}
      </div>
    </div>
  )
}

export type Repeat = 'daily' | 'weekly' | 'monthly' | 'once'

export const REPEAT_OPTIONS: { value: Repeat; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'once', label: 'Once' }
]

/** "weekly · 9:00 AM" → repeat + "HH:MM", same shape the trigger node stores. */
export function parseScheduleNode(text: string): { repeat: Repeat; time: string } {
  const [rawRepeat, rawTime] = text.split('·').map((part) => part.trim())
  const repeat = REPEAT_OPTIONS.find((option) => option.value === rawRepeat)?.value ?? 'daily'
  return { repeat, time: parseClock(rawTime ?? '') ?? '09:00' }
}

/** "09:00" → "9:00 AM", matching the schedule summaries elsewhere. */
export function clockLabel(clock: string): string {
  const [hours, minutes] = clock.split(':').map(Number)
  return formatTime(new Date(2000, 0, 1, Number.isFinite(hours) ? hours : 9, Number.isFinite(minutes) ? minutes : 0))
}

const ACTION_CHOICES: CanvasPick[] = [...ACTION_PICKS, ...LOGIC_PICKS]

const FIELD_LABEL: Partial<Record<CanvasKind, string>> = {
  filter: 'Condition',
  delay: 'Wait',
  action: 'Do',
  gmail: 'Do'
}

/**
 * Step inspector. A trigger edits its schedule (same "when" model as the
 * builder); every other step picks an app and describes what it does.
 */
export function CanvasStepEditor({ step, index, onApply, onClose }: {
  step: CanvasStep
  /** 1-based position in the chain. */
  index: number
  onApply(patch: Partial<Pick<CanvasStep, 'kind' | 'title' | 'subtitle'>>): void
  onClose(): void
}): React.JSX.Element {
  const isTrigger = step.kind === 'trigger'
  const schedule = parseScheduleNode(step.subtitle)
  const [repeat, setRepeat] = useState<Repeat>(schedule.repeat)
  const [time, setTime] = useState(schedule.time)
  const [kind, setKind] = useState<CanvasKind>(step.kind)
  const [title, setTitle] = useState(step.title)
  const [event, setEvent] = useState(/^select the/i.test(step.subtitle) ? '' : step.subtitle)

  const active = ACTION_CHOICES.find((pick) => pick.kind === kind && pick.title === title)
  const headerApp = TRIGGER_PICKS.find((pick) => pick.title === title)

  function chooseApp(pick: CanvasPick): void {
    setKind(pick.kind)
    setTitle(pick.title)
    if (!event.trim()) setEvent(pick.kind === 'filter' || pick.kind === 'delay' ? pick.subtitle : '')
  }

  function submit(e: React.FormEvent): void {
    e.preventDefault()
    if (isTrigger) {
      onApply({ kind: 'trigger', title: title.trim() || 'Trigger', subtitle: `${repeat} · ${clockLabel(time)}` })
      return
    }
    const fallback = kind === 'filter' ? 'Only continue if conditions match' : kind === 'delay' ? 'Wait before running the next step' : 'Select the app and event'
    onApply({ kind, title: title.trim() || 'Action', subtitle: event.trim() || fallback })
  }

  return (
    <form className="canvas-editor" onSubmit={submit}>
      <div className="canvas-editor-head">
        <span className="canvas-editor-icon" aria-hidden="true">
          {iconFor(headerApp?.id ?? active?.id ?? kind, kind, 18)}
        </span>
        <span className="canvas-editor-title">
          <small>Step {index}</small>
          <strong>{title}</strong>
        </span>
        <button type="button" className="canvas-editor-x" onClick={onClose} aria-label="Close step editor">×</button>
      </div>

      {isTrigger ? (
        <>
          <span className="canvas-label">App</span>
          <div className="canvas-apps" role="group" aria-label="Trigger app">
            {TRIGGER_PICKS.map((pick) => (
              <button
                key={pick.id}
                type="button"
                className="canvas-app"
                aria-pressed={title === pick.title}
                title={pick.hint}
                onClick={() => setTitle(pick.title)}
              >
                <span aria-hidden="true">{iconFor(pick.id, pick.kind, 16)}</span>
                {pick.label}
              </button>
            ))}
          </div>
          <label className="canvas-label" htmlFor="canvas-repeat">Repeat</label>
          <div className="canvas-schedule">
            <select
              id="canvas-repeat"
              className="canvas-select"
              value={repeat}
              onChange={(e) => setRepeat(e.currentTarget.value as Repeat)}
            >
              {REPEAT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <input
              type="time"
              className="canvas-select canvas-time"
              value={time}
              onChange={(e) => setTime(e.currentTarget.value || '09:00')}
              aria-label="Time"
            />
          </div>
        </>
      ) : (
        <>
          <span className="canvas-label">App</span>
          <div className="canvas-apps" role="group" aria-label="App">
            {ACTION_CHOICES.map((pick) => (
              <button
                key={pick.id}
                type="button"
                className="canvas-app"
                aria-pressed={active?.id === pick.id}
                title={pick.hint}
                onClick={() => chooseApp(pick)}
              >
                <span aria-hidden="true">{iconFor(pick.id, pick.kind, 16)}</span>
                {pick.label}
              </button>
            ))}
          </div>
          <label className="canvas-label" htmlFor="canvas-event">{FIELD_LABEL[kind] ?? 'Do'}</label>
          <input
            id="canvas-event"
            className="canvas-input"
            value={event}
            onChange={(e) => setEvent(e.currentTarget.value)}
            placeholder={kind === 'filter' ? 'Only continue if…' : kind === 'delay' ? 'Wait 30 minutes' : 'What should this step do?'}
          />
        </>
      )}

      <div className="canvas-editor-row">
        <button type="submit">Apply</button>
        <button type="button" onClick={onClose}>Done</button>
      </div>
    </form>
  )
}
