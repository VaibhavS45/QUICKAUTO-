import { useState } from 'react'
import { Boxes, Clock, Filter, FolderOpen, Globe, Plug, Table2, Terminal, Zap, type LucideIcon } from 'lucide-react'
import { TOOL_IDS, TOOL_META } from '../../../shared/types.js'
import { TIMER_TRIGGER, TRIGGER_APPS, triggerApp } from './trigger-events.js'
import { TriggerAppIcon } from './trigger-icons.js'
import type { CanvasKind, CanvasStep } from './canvas-steps.js'

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
export function CanvasStepPicker({ onPick, onClose, ariaLabel }: {
  onPick(target: CanvasPickTarget, pick: CanvasPick): void
  onClose(): void
  ariaLabel: string
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
