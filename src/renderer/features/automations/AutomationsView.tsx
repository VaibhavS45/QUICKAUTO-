import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FeatureProps } from '../../contracts/feature.js'
import type { RunRecord, ScheduleItem } from '../../../shared/contracts/schedule.js'
import { addDaysKey, dayLabel, localDayKey, monthGrid, monthLabel, pastDayLabel, routineOccursOn, routineTitle, timeLabel } from './dates.js'
import {
  NODE_H,
  NODE_W,
  WORLD,
  blankStep,
  canvasStepsForRoutine,
  edgePath,
  insertCanvasStep,
  moveCanvasStep,
  moveStepTo,
  removeCanvasStep,
  tidyCanvasSteps,
  updateCanvasStep,
  type CanvasKind,
  type CanvasStep
} from './canvas-steps.js'
import { blankDraft, blankTrigger, templateToDraft, type BuilderDraft } from './builder-compile.js'
import { toolDisplayLabel, requirementState } from '../../shell/template-requirements.js'
import { parseAutomationTab } from '../../shell/nav.js'
import Builder from './builder.js'
import CanvasDescribeBar from './canvas-describe.js'
import StartChoice, { type StartKind } from './start-choice.js'
import './automations.css'

interface Routine {
  id: string
  prompt: string
  tools: string[]
  runAt: number
  repeat: string
  enabled: boolean
  lastStatus?: string
}

type Selection =
  | { kind: 'schedule'; item: ScheduleItem }
  | { kind: 'run'; run: RunRecord }
  | { kind: 'routine'; routine: Routine }

interface ZapStep {
  kind: 'trigger' | 'action' | 'gmail'
  title: string
  subtitle: string
  filled: boolean
}

export const CANVAS_KINDS: { kind: CanvasKind; label: string; hint: string }[] = [
  { kind: 'trigger', label: 'Trigger', hint: 'Starts the workflow' },
  { kind: 'action', label: 'Action', hint: 'Do something' },
  { kind: 'gmail', label: 'Gmail', hint: 'Send or read email' },
  { kind: 'filter', label: 'Filter', hint: 'Only continue if…' },
  { kind: 'delay', label: 'Delay', hint: 'Wait, then continue' }
]

function errorText(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}

function ListIcon(): React.JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M2 4h12M2 8h12M2 12h12" strokeLinecap="round" />
    </svg>
  )
}

function CalendarIcon(): React.JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <rect x="2" y="3" width="12" height="11" rx="1.5" />
      <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" strokeLinecap="round" />
    </svg>
  )
}

function FilterIcon(): React.JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M2 3h12l-4.5 5.2V13l-3 1.2V8.2L2 3Z" strokeLinejoin="round" />
    </svg>
  )
}

function occurrenceAt(routine: Routine, cell: Date): number {
  const t = new Date(routine.runAt)
  const d = new Date(cell)
  d.setHours(t.getHours(), t.getMinutes(), 0, 0)
  return d.getTime()
}

export function stepsForRoutine(routine: Routine | undefined): ZapStep[] {
  return canvasStepsForRoutine(routine).map((s) => ({
    kind: s.kind === 'filter' || s.kind === 'delay' ? 'action' : s.kind,
    title: s.title,
    subtitle: s.subtitle,
    filled: s.filled
  }))
}

export function UpdatesList({ runs, todayKey, onSelect }: {
  runs: RunRecord[]
  todayKey: string
  onSelect(run: RunRecord): void
}): React.JSX.Element {
  if (runs.length === 0) return <p className="automations-empty">No outputs yet. Run an automation to see results here.</p>
  const byDay = new Map<string, RunRecord[]>()
  for (const run of runs) {
    const key = localDayKey(new Date(run.endedAt ?? run.startedAt))
    const list = byDay.get(key) ?? []
    list.push(run)
    byDay.set(key, list)
  }
  const days = [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  return (
    <>
      {days.map(([key, dayRuns]) => (
        <section key={key} className="updates-day" aria-label={pastDayLabel(key, todayKey)}>
          <h3>{pastDayLabel(key, todayKey)} <span>({dayRuns.length})</span></h3>
          {dayRuns.map((run) => (
            <button
              key={run.id}
              type="button"
              className="updates-row"
              onClick={() => onSelect(run)}
            >
              <span className="updates-row-meta">
                <span className="updates-row-icon" aria-hidden="true">⟁</span>
                <strong>{routineTitle(run.title)}</strong>
                <small>{timeLabel(run.endedAt ?? run.startedAt)}</small>
              </span>
              <span className="updates-row-body">{run.summary || 'No output recorded yet.'}</span>
            </button>
          ))}
        </section>
      ))}
    </>
  )
}

/** Dedicated run page: full info left, every agent run in a right rail. */
export function RunDetailPage({ run, runs, onSelect, onBack }: {
  run: RunRecord
  runs: RunRecord[]
  onSelect(run: RunRecord): void
  onBack(): void
}): React.JSX.Element {
  return (
    <section className="automations" aria-label="Run details">
      <div className="automations-create-top">
        <button type="button" className="automations-back" onClick={onBack}>← Back</button>
      </div>
      <div className="automations-run">
        <article className="automations-run-main" aria-label={routineTitle(run.title)}>
          <p className="automations-detail-kicker">
            Output · {new Date(run.startedAt).toLocaleString()}
          </p>
          <h3>{routineTitle(run.title)}</h3>
          <p className={`automations-status is-${run.status}`}>{run.status.replaceAll('_', ' ')}</p>
          <p className="automations-detail-body">{run.summary || 'No output recorded yet.'}</p>
        </article>
        <aside className="automations-run-rail" aria-label="All runs">
          <h3>Runs <small>({runs.length})</small></h3>
          {runs.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`automations-day-item${item.id === run.id ? ' is-active' : ''}`}
              aria-current={item.id === run.id}
              onClick={() => onSelect(item)}
            >
              <span className={`automations-dot is-${item.status}`} aria-hidden="true" />
              <span>{routineTitle(item.title)}</span>
              <time>{timeLabel(item.endedAt ?? item.startedAt)}</time>
            </button>
          ))}
        </aside>
      </div>
    </section>
  )
}

export function routineKindLabel(routine: Routine): string {
  return routine.tools.length > 1 ? 'Advanced' : 'Scheduled'
}

const ENGINE_LABELS: Record<string, string> = {
  builtin: 'Built-in',
  opencode: 'OpenCode',
  pi: 'pi'
}

export function RoutineRail({ routine, engine, connected, onOpenConnectors }: {
  routine: Routine
  engine: string
  connected: Readonly<Record<string, boolean | undefined>>
  onOpenConnectors(): void
}): React.JSX.Element {
  return (
    <aside className="manage-rail" aria-label="Automation configuration">
      <section>
        <h4>Agent</h4>
        <p className="rail-group"><span>Model</span></p>
        <p className="rail-row"><span>{ENGINE_LABELS[engine] ?? (engine || 'Not set')}</span></p>
      </section>
      <section>
        <p className="rail-group"><span>Connectors</span><span>{routine.tools.length}</span></p>
        {routine.tools.map((id) => {
          const state = requirementState(id, connected)
          return (
            <p className="rail-row" key={id}>
              <span>{toolDisplayLabel(id)}</span>
              <span className={`rail-mark is-${state}`} title={state === 'ready' ? 'Connected' : state === 'connect' ? 'Needs connection' : 'Status unavailable'}>
                {state === 'ready' ? '✓' : state === 'connect' ? '!' : '·'}
              </span>
            </p>
          )
        })}
        <button type="button" className="rail-view-all" onClick={onOpenConnectors}>
          <span>View all</span><span aria-hidden="true">›</span>
        </button>
      </section>
    </aside>
  )
}

export function ManageDetail({ routine, runs, onToggle, onRemove, onSelectRun }: {
  routine: Routine
  runs: RunRecord[]
  onToggle(routine: Routine): void
  onRemove(routine: Routine): void
  onSelectRun(run: RunRecord): void
}): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false)
  const [section, setSection] = useState<'details' | 'history'>('details')
  const history = runs.filter((run) => run.routineId === routine.id)
  return (
    <div className="manage-detail">
      <div className="md-top">
        <span className="md-icon" aria-hidden="true">⟁</span>
        <span className={`automations-status is-${routine.enabled ? 'active' : 'paused'}`}>
          <span className={`automations-dot ${routine.enabled ? 'is-succeeded' : 'is-cancelled'}`} />{routine.enabled ? 'Active' : 'Paused'}
        </span>
        <div className="md-menu-wrap">
          <button
            type="button"
            aria-label={`Options for ${routineTitle(routine.prompt)}`}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            …
          </button>
          {menuOpen && (
            <div className="automations-menu" role="menu">
              <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onToggle(routine) }}>
                {routine.enabled ? 'Pause' : 'Resume'}
              </button>
              <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onRemove(routine) }}>Delete</button>
            </div>
          )}
        </div>
      </div>
      <p className="md-kind">{routineKindLabel(routine)}</p>
      <h3>{routineTitle(routine.prompt)}</h3>
      <p className="md-desc">{routine.prompt}</p>
      <div className="md-tabs" role="tablist" aria-label={`${routineTitle(routine.prompt)} sections`}>
        <button type="button" role="tab" aria-selected={section === 'details'} onClick={() => setSection('details')}>Details</button>
        <button type="button" role="tab" aria-selected={section === 'history'} onClick={() => setSection('history')}>History</button>
      </div>
      {section === 'details' ? (
        <>
          <h4>Title</h4>
          <p className="md-field">{routineTitle(routine.prompt)}</p>
          <h4>When</h4>
          <p className="md-field">Repeat {routine.repeat} at {timeLabel(routine.runAt)}</p>
          <h4>The agent will</h4>
          <p className="md-field">{routine.prompt}</p>
          <details className="md-advanced">
            <summary>
              <span><strong>Advanced settings</strong><small>Repeat, tools, and last status.</small></span>
            </summary>
            <dl>
              <div><dt>Repeat</dt><dd>{routine.repeat}</dd></div>
              <div><dt>Runs at</dt><dd>{timeLabel(routine.runAt)}</dd></div>
              <div><dt>Tools</dt><dd>{routine.tools.length ? routine.tools.map((t) => `@${t}`).join(' ') : 'none'}</dd></div>
              {routine.lastStatus && <div><dt>Last status</dt><dd>{routine.lastStatus}</dd></div>}
            </dl>
          </details>
        </>
      ) : (
        <>
          <h4>History</h4>
          {history.length === 0 && <p className="md-desc">No runs yet.</p>}
          {history.map((run) => (
            <button key={run.id} type="button" className="automations-history" onClick={() => onSelectRun(run)}>
              <span className={`automations-dot is-${run.status}`} />
              <span>
                <strong>{new Date(run.endedAt ?? run.startedAt).toLocaleString()}</strong>
                <small>{run.status.replaceAll('_', ' ')}</small>
              </span>
            </button>
          ))}
        </>
      )}
    </div>
  )
}

export default function AutomationsView(props: FeatureProps): React.JSX.Element {
  const [tab, setTab] = useState<'updates' | 'manage' | 'canvas'>(() => parseAutomationTab(props.initialAutomationTab) ?? 'manage')
  const [view, setView] = useState<'list' | 'calendar'>('list')
  const [routines, setRoutines] = useState<Routine[]>([])
  const [runs, setRuns] = useState<RunRecord[]>([])
  const [todayItems, setTodayItems] = useState<ScheduleItem[]>([])
  const [tomorrowItems, setTomorrowItems] = useState<ScheduleItem[]>([])
  const [todayKey] = useState(() => localDayKey())
  const [monthCursor, setMonthCursor] = useState(() => {
    const now = new Date()
    return { y: now.getFullYear(), m: now.getMonth() }
  })
  const [canvasSteps, setCanvasSteps] = useState<CanvasStep[]>(() => canvasStepsForRoutine(undefined))
  const [canvasKey, setCanvasKey] = useState('')
  const [selectedStepId, setSelectedStepId] = useState('')
  const [openStepMenuId, setOpenStepMenuId] = useState('')
  const [addAt, setAddAt] = useState<number | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editEvent, setEditEvent] = useState('')
  const [editKind, setEditKind] = useState<CanvasKind>('action')
  const [vp, setVp] = useState({ x: 24, y: 0, z: 1 })
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<
    | { mode: 'pan'; sx: number; sy: number; ox: number; oy: number }
    | { mode: 'node'; id: string; dx: number; dy: number }
    | null
  >(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeOnly, setActiveOnly] = useState(false)
  const [builderOpen, setBuilderOpen] = useState(false)
  const [choiceOpen, setChoiceOpen] = useState(false)
  const [canvasDescribe, setCanvasDescribe] = useState(false)
  const [canvasPrompt, setCanvasPrompt] = useState('')
  const [canvasBusy, setCanvasBusy] = useState(false)
  const [canvasError, setCanvasError] = useState('')
  const [builderInitial, setBuilderInitial] = useState<BuilderDraft>(() => blankDraft())
  const [gmailConnected, setGmailConnected] = useState<boolean | undefined>(undefined)

  useEffect(() => {
    if (!builderOpen) return
    let active = true
    window.app.connectionStatus('gmail')
      .then((res) => {
        if (active) setGmailConnected(res.ok ? res.connected : undefined)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [builderOpen])
  const [selection, setSelection] = useState<Selection | null>(null)
  const [engine, setEngine] = useState('')
  const [connected, setConnected] = useState<Record<string, boolean | undefined>>({})

  useEffect(() => {
    let live = true
    void Promise.all([window.app.getAgentProvider(), window.app.getConnector(), window.app.connectionStatus('gmail')])
      .then(([provider, connector, gmail]) => {
        if (!live) return
        if (provider.ok && provider.provider) setEngine(provider.provider)
        const statuses: Record<string, boolean | undefined> = {}
        for (const service of connector.services ?? []) statuses[service.id] = service.connected
        statuses.gmail = gmail.ok ? gmail.connected : undefined
        setConnected(statuses)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  const tomorrowKey = addDaysKey(todayKey, 1)
  const monthCells = monthGrid(monthCursor.y, monthCursor.m)

  const refresh = useCallback(async (): Promise<void> => {
    const [routineRes, runsRes, todayRes, tomorrowRes] = await Promise.all([
      window.app.routineList(),
      window.app.recentTasks(20),
      window.app.scheduleToday(),
      window.app.scheduleToday(tomorrowKey)
    ])
    if (!routineRes.ok) throw new Error('Could not load automations.')
    if (!runsRes.ok || !runsRes.runs) throw new Error(runsRes.error || 'Could not load outputs.')
    if (!todayRes.ok || !todayRes.schedule) throw new Error(todayRes.error || 'Could not load today’s schedule.')
    if (!tomorrowRes.ok || !tomorrowRes.schedule) throw new Error(tomorrowRes.error || 'Could not load tomorrow’s schedule.')
    setRoutines(routineRes.routines as Routine[])
    setRuns(runsRes.runs)
    setTodayItems(todayRes.schedule.items)
    setTomorrowItems(tomorrowRes.schedule.items)
    setError('')
  }, [tomorrowKey])

  useEffect(() => {
    let active = true
    setLoading(true)
    refresh()
      .catch((reason: unknown) => {
        if (active) setError(errorText(reason))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    const unsubscribe = window.app.onScheduleChanged(() => {
      refresh().catch((reason: unknown) => setError(errorText(reason)))
    })
    return () => {
      active = false
      unsubscribe()
    }
  }, [refresh])

  const openedTemplate = useRef<string>('')
  const openedStartKind = useRef<string>('')
  useEffect(() => {
    if (!props.initialTemplate || openedTemplate.current === props.initialTemplate.id) return
    openedTemplate.current = props.initialTemplate.id
    setBuilderInitial(templateToDraft(props.initialTemplate))
    setBuilderOpen(true)
  }, [props.initialTemplate])

  useEffect(() => {
    if (!props.initialStartKind || openedStartKind.current === props.initialStartKind) return
    openedStartKind.current = props.initialStartKind
    if (props.initialStartKind === 'schedule') setBuilderInitial({ ...blankDraft(), mode: 'manual', triggers: [blankTrigger('schedule')] })
    else if (props.initialStartKind === 'triggered') setBuilderInitial({ ...blankDraft(), mode: 'manual', triggers: [] })
    else if (props.initialStartKind === 'advanced') {
      setTab('canvas')
      setCanvasDescribe(true)
      return
    }
    else return
    setBuilderOpen(true)
  }, [props.initialStartKind])

  useEffect(() => {
    const next = parseAutomationTab(props.initialAutomationTab)
    if (next) setTab(next)
  }, [props.initialAutomationTab])

  useEffect(() => {
    if (!props.focusId || routines.length === 0) return
    const item =
      todayItems.find((candidate) => candidate.routineId === props.focusId) ??
      tomorrowItems.find((candidate) => candidate.routineId === props.focusId)
    if (item) {
      setTab('manage')
      setSelection({ kind: 'schedule', item })
    }
  }, [props.focusId, routines.length, todayItems, tomorrowItems])

  function pickStart(kind: StartKind): void {
    setChoiceOpen(false)
    if (kind === 'advanced') {
      setTab('canvas')
      setCanvasDescribe(true)
      return
    }
    if (kind === 'schedule') setBuilderInitial({ ...blankDraft(), mode: 'manual', triggers: [blankTrigger('schedule')] })
    else setBuilderInitial({ ...blankDraft(), mode: 'manual', triggers: [] })
    setBuilderOpen(true)
  }

  function closeCreate(): void {
    setChoiceOpen(false)
    setBuilderOpen(false)
  }

  async function submitBuilder(text: string): Promise<string | null> {
    try {
      const result = await window.app.routineCreate(text)
      if (!result.ok) throw new Error(result.error || 'Could not create the automation.')
      setBuilderOpen(false)
      await refresh()
      const created = (result as { routine?: Routine }).routine
      if (created) {
        setTab('manage')
        setView('list')
        setRoutinePageId(created.id)
      }
      return null
    } catch (reason) {
      return errorText(reason)
    }
  }

  async function submitCanvasDescribe(): Promise<void> {
    const text = canvasPrompt.trim()
    if (!text || canvasBusy) return
    setCanvasBusy(true)
    setCanvasError('')
    try {
      const failure = await submitBuilder(text)
      if (failure) {
        setCanvasError(failure)
        return
      }
      setCanvasPrompt('')
      setCanvasDescribe(false)
      setTab('canvas')
    } finally {
      setCanvasBusy(false)
    }
  }

  async function toggleRoutine(routine: Routine): Promise<void> {
    try {
      const result = await window.app.routineToggle(routine.id, !routine.enabled)
      if (!result.ok) throw new Error(result.error || 'Could not update the automation.')
      await refresh()
    } catch (reason) {
      setError(errorText(reason))
    }
  }

  async function removeRoutine(routine: Routine): Promise<void> {
    try {
      const result = await window.app.routineRemove(routine.id)
      if (!result.ok) throw new Error(result.error || 'Could not delete the automation.')
      if (selection?.kind === 'routine' && selection.routine.id === routine.id) setSelection(null)
      await refresh()
    } catch (reason) {
      setError(errorText(reason))
    }
  }

  function runForRoutine(routineId: string): RunRecord | undefined {
    return runs.find((run) => run.routineId === routineId)
  }

  const visibleRoutines = (activeOnly ? routines.filter((routine) => routine.enabled) : routines).sort((a, b) => {
    if (props.focusId) {
      if (a.id === props.focusId) return -1
      if (b.id === props.focusId) return 1
    }
    return Number(b.enabled) - Number(a.enabled) || a.runAt - b.runAt
  })

  const runsByDay = new Map<string, RunRecord[]>()
  for (const run of runs) {
    const key = localDayKey(new Date(run.endedAt ?? run.startedAt))
    const list = runsByDay.get(key) ?? []
    list.push(run)
    runsByDay.set(key, list)
  }

  function shiftMonth(delta: number): void {
    setMonthCursor((cur) => {
      const d = new Date(cur.y, cur.m + delta, 1)
      return { y: d.getFullYear(), m: d.getMonth() }
    })
  }

  function goToday(): void {
    const now = new Date()
    setMonthCursor({ y: now.getFullYear(), m: now.getMonth() })
  }

  const monthHead = (
    <div className="automations-month-head">
      <strong>{monthLabel(monthCursor.y, monthCursor.m)}</strong>
      <div className="automations-month-nav">
        <button type="button" aria-label="Previous month" onClick={() => shiftMonth(-1)}>‹</button>
        <button type="button" onClick={goToday}>Today</button>
        <button type="button" aria-label="Next month" onClick={() => shiftMonth(1)}>›</button>
      </div>
    </div>
  )

  const canvasRoutine =
    (selection?.kind === 'routine' ? selection.routine : undefined) ??
    visibleRoutines.find((r) => r.id === props.focusId) ??
    visibleRoutines[0]
  const canvasRoutineKey = canvasRoutine?.id ?? 'blank'

  useEffect(() => {
    if (canvasRoutineKey !== canvasKey) {
      setCanvasKey(canvasRoutineKey)
      setCanvasSteps(canvasStepsForRoutine(canvasRoutine))
      setSelectedStepId('')
      setOpenStepMenuId('')
      setAddAt(null)
    }
  }, [canvasRoutineKey, canvasKey, canvasRoutine])

  const selectedStep = useMemo(
    () => canvasSteps.find((s) => s.id === selectedStepId) ?? null,
    [canvasSteps, selectedStepId]
  )

  useEffect(() => {
    if (selectedStep) {
      setEditTitle(selectedStep.title)
      setEditEvent(selectedStep.subtitle)
      setEditKind(selectedStep.kind)
    }
  }, [selectedStep?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  function pickStep(step: CanvasStep): void {
    setSelectedStepId(step.id)
    setEditTitle(step.title)
    setEditEvent(step.subtitle)
    setEditKind(step.kind)
  }

  function saveStepEdit(event: React.FormEvent): void {
    event.preventDefault()
    if (!selectedStep) return
    const title =
      editKind === 'trigger' ? 'Trigger'
      : editKind === 'gmail' ? 'Gmail'
      : editKind === 'filter' ? 'Filter'
      : editKind === 'delay' ? 'Delay'
      : editTitle.trim() || 'Action'
    setCanvasSteps((steps) => updateCanvasStep(steps, selectedStep.id, { kind: editKind, title, subtitle: editEvent.trim() || blankStep(editKind).subtitle }))
  }

  const stepsRef = useRef(canvasSteps)
  stepsRef.current = canvasSteps

  function addAtPoint(clientX: number, clientY: number): void {
    const w = toWorld(clientX, clientY)
    setCanvasSteps((steps) =>
      insertCanvasStep(steps, steps.length, 'action', { x: w.x - NODE_W / 2, y: w.y - NODE_H / 2 })
    )
  }

  useEffect(() => {
    if (tab !== 'canvas') return
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement | null
      if (t?.closest('input, select, textarea')) return
      if (e.key === 'Escape') {
        setSelectedStepId('')
        setOpenStepMenuId('')
        setAddAt(null)
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedStepId) {
        const step = stepsRef.current.find((s) => s.id === selectedStepId)
        if (!step || step.kind === 'trigger' || stepsRef.current.length <= 1) return
        setCanvasSteps((steps) => removeCanvasStep(steps, selectedStepId))
        setSelectedStepId('')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tab, selectedStepId])

  function toWorld(clientX: number, clientY: number): { x: number; y: number } {
    const rect = viewportRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return { x: (clientX - rect.left - vp.x) / vp.z, y: (clientY - rect.top - vp.y) / vp.z }
  }

  function beginPan(event: React.PointerEvent): void {
    if ((event.target as HTMLElement).closest('input, select, textarea, button')) return
    dragRef.current = { mode: 'pan', sx: event.clientX, sy: event.clientY, ox: vp.x, oy: vp.y }
    const move = (e: PointerEvent): void => {
      const d = dragRef.current
      if (!d || d.mode !== 'pan') return
      setVp((v) => ({ ...v, x: d.ox + (e.clientX - d.sx), y: d.oy + (e.clientY - d.sy) }))
    }
    const up = (): void => {
      dragRef.current = null
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  function beginNodeDrag(event: React.PointerEvent, step: CanvasStep): void {
    if ((event.target as HTMLElement).closest('button')) return
    event.stopPropagation()
    const w = toWorld(event.clientX, event.clientY)
    dragRef.current = { mode: 'node', id: step.id, dx: w.x - step.pos.x, dy: w.y - step.pos.y }
    pickStep(step)
    const move = (e: PointerEvent): void => {
      const d = dragRef.current
      if (!d || d.mode !== 'node') return
      const rect = viewportRef.current?.getBoundingClientRect()
      if (!rect) return
      const z = vp.z
      const x = (e.clientX - rect.left - vp.x) / z - d.dx
      const y = (e.clientY - rect.top - vp.y) / z - d.dy
      setCanvasSteps((steps) => moveStepTo(steps, d.id, x, y))
    }
    const up = (): void => {
      dragRef.current = null
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  function zoomBy(factor: number): void {
    setVp((v) => ({ ...v, z: Math.max(0.4, Math.min(1.6, v.z * factor)) }))
  }

  function fitCanvas(): void {
    if (canvasSteps.length === 0) {
      setVp({ x: 24, y: 0, z: 1 })
      return
    }
    const rect = viewportRef.current?.getBoundingClientRect()
    const vw = rect?.width ?? 800
    const vh = rect?.height ?? 480
    const xs = canvasSteps.map((s) => s.pos.x)
    const ys = canvasSteps.map((s) => s.pos.y)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs) + NODE_W
    const minY = Math.min(...ys)
    const maxY = Math.max(...ys) + NODE_H
    const z = Math.max(0.4, Math.min(1.2, Math.min((vw - 80) / Math.max(1, maxX - minX), (vh - 80) / Math.max(1, maxY - minY))))
    setVp({ x: 40 - minX * z, y: vh / 2 - ((minY + maxY) / 2) * z, z })
  }

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      setVp((v) => ({ ...v, z: Math.max(0.4, Math.min(1.6, v.z * (e.deltaY > 0 ? 0.92 : 1.08))) }))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [tab])

  const detail = selection === null ? null : (
    <aside className="automations-detail" aria-label="Automation details">
      <button type="button" className="automations-detail-close" aria-label="Close details" onClick={() => setSelection(null)}>×</button>
      {selection.kind === 'run' && (
        <>
          <p className="automations-detail-kicker">Output · {new Date(selection.run.startedAt).toLocaleString()}</p>
          <h3>{selection.run.title}</h3>
          <p className={`automations-status is-${selection.run.status}`}>{selection.run.status.replaceAll('_', ' ')}</p>
          <p className="automations-detail-body">{selection.run.summary || 'No output recorded yet.'}</p>
        </>
      )}
      {selection.kind === 'schedule' && (
        <>
          <p className="automations-detail-kicker">{dayLabel(localDayKey(new Date(selection.item.at)), todayKey)} · {timeLabel(selection.item.at)}</p>
          <h3>{routineTitle(selection.item.title)}</h3>
          <p className={`automations-status is-${selection.item.status}`}>{selection.item.status}</p>
          {selection.item.routineId && runForRoutine(selection.item.routineId) && (
            <>
              <h4>Latest output</h4>
              <p className="automations-detail-body">{runForRoutine(selection.item.routineId!)?.summary || 'No output recorded yet.'}</p>
            </>
          )}
        </>
      )}
      {selection.kind === 'routine' && (
        <>
          <p className="automations-detail-kicker">{selection.routine.enabled ? 'Active' : 'Paused'} · {selection.routine.repeat} · {timeLabel(selection.routine.runAt)}</p>
          <h3>{routineTitle(selection.routine.prompt)}</h3>
          <p className="automations-detail-body">{selection.routine.prompt}</p>
          {selection.routine.lastStatus && <p className="automations-detail-meta">Last status: {selection.routine.lastStatus}</p>}
          <div className="automations-detail-row">
            <button type="button" onClick={() => void toggleRoutine(selection.routine)}>
              {selection.routine.enabled ? 'Pause' : 'Resume'}
            </button>
            <button type="button" onClick={() => void removeRoutine(selection.routine)}>Delete</button>
          </div>
          <h4>History</h4>
          {runs.filter((run) => run.routineId === selection.routine.id).length === 0 && (
            <p className="automations-detail-body">No runs yet.</p>
          )}
          {runs.filter((run) => run.routineId === selection.routine.id).map((run) => (
            <button key={run.id} type="button" className="automations-history" onClick={() => setSelection({ kind: 'run', run })}>
              <span className={`automations-dot is-${run.status}`} />
              <span>
                <strong>{new Date(run.endedAt ?? run.startedAt).toLocaleString()}</strong>
                <small>{run.status.replaceAll('_', ' ')}</small>
              </span>
            </button>
          ))}
        </>
      )}
    </aside>
  )

  const creating = choiceOpen || builderOpen
  const [runId, setRunId] = useState(props.focusRunId ?? '')
  const [routinePageId, setRoutinePageId] = useState('')
  const openedRunId = useRef('')
  useEffect(() => {
    if (!props.focusRunId || openedRunId.current === props.focusRunId) return
    openedRunId.current = props.focusRunId
    setRunId(props.focusRunId)
  }, [props.focusRunId])

  if (creating) {
    return (
      <section className="automations is-creating" aria-label="Create automation">
        <div className="automations-create-top">
          <button type="button" className="automations-back" aria-label="Back to automations" onClick={closeCreate}>←</button>
        </div>
        {choiceOpen && !builderOpen && (
          <StartChoice onPick={pickStart} onClose={closeCreate} />
        )}
        {builderOpen && (
          <Builder
            initial={builderInitial}
            gmailConnected={gmailConnected}
            onConnect={() => props.shell.openSettings('connectors')}
            onClose={closeCreate}
            onSubmit={submitBuilder}
          />
        )}
      </section>
    )
  }

  if (runId) {
    const run = runs.find((candidate) => candidate.id === runId)
    if (loading) {
      return (
        <section className="automations" aria-label="Run details">
          <div className="automations-create-top">
            <button type="button" className="automations-back" onClick={() => setRunId('')}>← Back</button>
          </div>
          <p className="automations-empty">Loading run…</p>
        </section>
      )
    }
    if (!run) {
      return (
        <section className="automations" aria-label="Run details">
          <div className="automations-create-top">
            <button type="button" className="automations-back" onClick={() => setRunId('')}>← Back</button>
          </div>
          <p className="automations-empty">This run is no longer available.</p>
        </section>
      )
    }
    return (
      <RunDetailPage
        run={run}
        runs={runs}
        onSelect={(next) => setRunId(next.id)}
        onBack={() => setRunId('')}
      />
    )
  }

  if (routinePageId) {
    const routine = routines.find((candidate) => candidate.id === routinePageId)
    if (!routine) {
      return (
        <section className="automations" aria-label="Automation details">
          <div className="automations-create-top">
            <button type="button" className="automations-back" onClick={() => setRoutinePageId('')}>← Back</button>
          </div>
          <p className="automations-empty">This automation is no longer available.</p>
        </section>
      )
    }
    return (
      <section className="automations" aria-label="Automation details">
        <div className="automations-create-top">
          <button type="button" className="automations-back" onClick={() => setRoutinePageId('')}>← Back</button>
        </div>
        <div className="automations-routine">
          <ManageDetail
            routine={routine}
            runs={runs}
            onToggle={(target) => void toggleRoutine(target)}
            onRemove={(target) => void removeRoutine(target)}
            onSelectRun={(selected) => setRunId(selected.id)}
          />
          <RoutineRail
            routine={routine}
            engine={engine}
            connected={connected}
            onOpenConnectors={() => props.shell.openSettings('connectors')}
          />
        </div>
      </section>
    )
  }

  return (
    <section className="automations" aria-label="Automations">
      <div className="automations-toolbar">
        <div className="automations-actions">
          {tab !== 'canvas' && (
            <div className="automations-view-toggle" role="tablist" aria-label={tab === 'updates' ? 'Updates view' : 'Manage view'}>
              <button type="button" role="tab" aria-selected={view === 'list'} aria-label="List" title="List" onClick={() => setView('list')}>
                <ListIcon />
              </button>
              <button type="button" role="tab" aria-selected={view === 'calendar'} aria-label="Calendar" title="Calendar" onClick={() => setView('calendar')}>
                <CalendarIcon />
              </button>
            </div>
          )}
          <button type="button" className="automations-create-btn" onClick={() => setChoiceOpen(true)}>+ Create</button>
          <button
            type="button"
            className={`automations-filter${activeOnly ? ' is-on' : ''}`}
            aria-label={activeOnly ? 'Show all' : 'Filter active only'}
            aria-pressed={activeOnly}
            title={activeOnly ? 'Show all' : 'Show active only'}
            onClick={() => setActiveOnly((value) => !value)}
          >
            <FilterIcon />
          </button>
        </div>
      </div>

      {loading && <p className="automations-empty">Loading automations…</p>}
      {error && <p className="automations-error" role="alert">{error}</p>}

      {!loading && !error && tab === 'updates' && view === 'list' && (
        <div className="automations-body">
          <div className="automations-main">
            <UpdatesList runs={runs} todayKey={todayKey} onSelect={(run) => setSelection({ kind: 'run', run })} />
          </div>
          {detail}
        </div>
      )}

      {!loading && !error && tab === 'updates' && view === 'calendar' && (
        <div className="automations-calendar">
          {monthHead}
          <div className="automations-weekdays" aria-hidden="true">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <span key={d}>{d}</span>)}
          </div>
          <div className="automations-month-grid">
            {monthCells.map((cell) => {
              const dayRuns = runsByDay.get(cell.key) ?? []
              const label = cell.date.getMonth() !== monthCursor.m
                ? cell.date.toLocaleDateString([], { month: 'short', day: 'numeric' })
                : String(cell.date.getDate())
              return (
                <div key={cell.key} className={`automations-cell${cell.key === todayKey ? ' is-today' : ''}${cell.inMonth ? '' : ' is-outside'}`}>
                  <span className="automations-cell-day">{label}</span>
                  {dayRuns.slice(0, 3).map((run) => (
                    <button key={run.id} type="button" className="automations-chip" onClick={() => setSelection({ kind: 'run', run })}>
                      <span aria-hidden="true">⚡</span> {routineTitle(run.title)}
                    </button>
                  ))}
                  {dayRuns.length > 3 && <small className="automations-more">+{dayRuns.length - 3} more</small>}
                </div>
              )
            })}
          </div>
          {detail}
        </div>
      )}

      {!loading && !error && tab === 'manage' && view === 'list' && (
        <div className="automations-body manage-layout">
          <div className="manage-list" role="listbox" aria-label="Automations">
            {visibleRoutines.length === 0 && <p className="automations-empty">No automations yet. Use Create to add one.</p>}
            {visibleRoutines.map((routine) => {
              const selected = selection?.kind === 'routine' && selection.routine.id === routine.id
              return (
                <button
                  key={routine.id}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  className={`manage-row${selected ? ' is-active' : ''}`}
                  onClick={() => setRoutinePageId(routine.id)}
                >
                  <span className="manage-row-top">
                    <span className="manage-row-icon" aria-hidden="true">⟁</span>
                    <span className={`automations-status is-${routine.enabled ? 'active' : 'paused'}`}>
                      <span className={`automations-dot ${routine.enabled ? 'is-succeeded' : 'is-cancelled'}`} aria-hidden="true" />
                      {routine.enabled ? 'Active' : 'Paused'}
                    </span>
                  </span>
                  <span className="manage-row-kind">{routineKindLabel(routine)} automation</span>
                  <strong>{routineTitle(routine.prompt)}</strong>
                  <span className="manage-row-desc">{routine.prompt}</span>
                </button>
              )
            })}
          </div>
          {selection?.kind === 'routine' ? (
            <>
              <ManageDetail
                routine={selection.routine}
                runs={runs}
                onToggle={(routine) => void toggleRoutine(routine)}
                onRemove={(routine) => void removeRoutine(routine)}
                onSelectRun={(run) => setSelection({ kind: 'run', run })}
              />
              <RoutineRail
                routine={selection.routine}
                engine={engine}
                connected={connected}
                onOpenConnectors={() => props.shell.openSettings('connectors')}
              />
            </>
          ) : detail}
        </div>
      )}

      {!loading && !error && tab === 'manage' && view === 'calendar' && (
        <div className="automations-calendar">
          {monthHead}
          <div className="automations-weekdays" aria-hidden="true">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <span key={d}>{d}</span>)}
          </div>
          <div className="automations-month-grid">
            {monthCells.map((cell) => {
              const occurring = visibleRoutines.filter((r) => routineOccursOn(r, cell.key))
              const label = cell.date.getMonth() !== monthCursor.m
                ? cell.date.toLocaleDateString([], { month: 'short', day: 'numeric' })
                : String(cell.date.getDate())
              return (
                <div key={cell.key} className={`automations-cell${cell.key === todayKey ? ' is-today' : ''}${cell.inMonth ? '' : ' is-outside'}`}>
                  <span className="automations-cell-day">{label}</span>
                  {occurring.slice(0, 3).map((routine) => (
                    <button
                      key={`${routine.id}-${cell.key}`}
                      type="button"
                      className="automations-chip"
                      onClick={() => setSelection({
                        kind: 'schedule',
                        item: {
                          id: `${routine.id}-${cell.key}`,
                          routineId: routine.id,
                          title: routine.prompt,
                          kind: 'schedule',
                          at: occurrenceAt(routine, cell.date),
                          status: routine.enabled ? 'upcoming' : 'skipped',
                          toolIds: routine.tools
                        }
                      })}
                    >
                      <span aria-hidden="true">⚡</span> {routineTitle(routine.prompt)}
                    </button>
                  ))}
                  {occurring.length > 3 && <small className="automations-more">+{occurring.length - 3} more</small>}
                </div>
              )
            })}
          </div>
          {detail}
        </div>
      )}

      {!loading && !error && tab === 'canvas' && (
        <div className="automations-canvas">
          <div
            className="n8n-viewport"
            ref={viewportRef}
            onPointerDown={beginPan}
            onDoubleClick={(e) => {
              if ((e.target as HTMLElement).closest('.n8n-node, .n8n-menu, .n8n-edge-add, .n8n-end, button, .n8n-toolbar, .n8n-topbar, .n8n-inspector, .n8n-describe')) return
              addAtPoint(e.clientX, e.clientY)
            }}
            aria-label={canvasRoutine ? `Canvas for ${routineTitle(canvasRoutine.prompt)}` : 'Canvas builder'}
          >
            <div className="n8n-topbar">
              <span className="n8n-status">
                {canvasRoutine ? `${routineTitle(canvasRoutine.prompt)} · ${canvasRoutine.repeat} · ${timeLabel(canvasRoutine.runAt)}` : 'Blank canvas'}
              </span>
              <button type="button" className="n8n-create" title="Describe an automation for the agent to create" onClick={() => setCanvasDescribe(true)}>Create</button>
            </div>
            <div className="n8n-toolbar" role="toolbar" aria-label="Canvas controls">
              <button type="button" aria-label="Zoom out" onClick={() => zoomBy(0.9)}>−</button>
              <span aria-hidden="true">{Math.round(vp.z * 100)}%</span>
              <button type="button" aria-label="Zoom in" onClick={() => zoomBy(1.1)}>+</button>
              <button type="button" aria-label="Fit to screen" onClick={fitCanvas}>Fit</button>
              <button type="button" aria-label="Tidy layout" title="Arrange nodes left to right" onClick={() => setCanvasSteps((s) => tidyCanvasSteps(s))}>Tidy</button>
            </div>
            <div
              className="n8n-world"
              style={{ width: WORLD.w, height: WORLD.h, transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.z})` }}
            >
              <svg className="n8n-edges" width={WORLD.w} height={WORLD.h} aria-hidden="true">
                <defs>
                  <marker id="n8n-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                    <path d="M 0 1 L 9 5 L 0 9" fill="none" stroke="#8f8f96" strokeWidth="1.6" />
                  </marker>
                </defs>
                {canvasSteps.slice(1).map((step, k) => (
                  <path key={`e-${canvasSteps[k].id}-${step.id}`} d={edgePath(canvasSteps[k].pos, step.pos)} fill="none" stroke="#8f8f96" strokeWidth="2" markerEnd="url(#n8n-arrow)" />
                ))}
              </svg>
              {canvasSteps.map((step, i) => (
                <article
                  key={step.id}
                  className={`n8n-node is-${step.kind}${selectedStepId === step.id ? ' is-selected' : ''}${step.filled ? ' is-filled' : ''}`}
                  style={{ left: step.pos.x, top: step.pos.y }}
                  onPointerDown={(e) => beginNodeDrag(e, step)}
                  aria-current={selectedStepId === step.id}
                >
                  <span className="n8n-handle in" aria-hidden="true" />
                  <button type="button" className="n8n-head" onClick={() => pickStep(step)} aria-label={`Configure step ${i + 1} ${step.title}`}>
                    <span className="n8n-icon" aria-hidden="true">
                      {step.kind === 'trigger' ? '⚡' : step.kind === 'gmail' ? '✉' : step.kind === 'filter' ? '⧩' : step.kind === 'delay' ? '◷' : '◆'}
                    </span>
                    <span className="n8n-titles">
                      <strong>{step.title}</strong>
                      <small>{step.subtitle || 'Select the app and event'}</small>
                    </span>
                    {!step.filled && <span className="n8n-warn" title="Needs configuration">!</span>}
                  </button>
                  <div className="n8n-foot">
                    <span className="n8n-num">{i + 1}</span>
                    <button
                      type="button"
                      aria-label={`Options for step ${i + 1} ${step.title}`}
                      aria-expanded={openStepMenuId === step.id}
                      onClick={() => setOpenStepMenuId((cur) => (cur === step.id ? '' : step.id))}
                    >
                      ⋮
                    </button>
                  </div>
                  <span className="n8n-handle out" aria-hidden="true" />
                  {openStepMenuId === step.id && (
                    <div className="n8n-menu" role="menu">
                      <button type="button" role="menuitem" onClick={() => { pickStep(step); setOpenStepMenuId('') }}>Configure</button>
                      <button type="button" role="menuitem" disabled={i === 0} onClick={() => { setCanvasSteps((s) => moveCanvasStep(s, step.id, -1)); setOpenStepMenuId('') }}>Move left</button>
                      <button type="button" role="menuitem" disabled={i === canvasSteps.length - 1} onClick={() => { setCanvasSteps((s) => moveCanvasStep(s, step.id, 1)); setOpenStepMenuId('') }}>Move right</button>
                      <button type="button" role="menuitem" disabled={canvasSteps.length <= 1 || step.kind === 'trigger'} onClick={() => { setCanvasSteps((s) => removeCanvasStep(s, step.id)); setOpenStepMenuId('') }}>Delete</button>
                    </div>
                  )}
                </article>
              ))}
              {canvasSteps.slice(1).map((step, k) => {
                const a = canvasSteps[k].pos
                const b = step.pos
                const mx = (a.x + NODE_W + b.x) / 2
                const my = (a.y + b.y) / 2 + NODE_H / 2
                const edgeIndex = k + 1
                return (
                  <div key={`add-${step.id}`} className="n8n-edge-add" style={{ left: mx, top: my }}>
                    <button
                      type="button"
                      aria-label={`Add step before step ${edgeIndex + 1}`}
                      aria-expanded={addAt === edgeIndex}
                      onClick={() => setAddAt((cur) => (cur === edgeIndex ? null : edgeIndex))}
                    >
                      +
                    </button>
                    {addAt === edgeIndex && (
                      <div className="n8n-menu" role="menu" aria-label={`Add step before step ${edgeIndex + 1}`}>
                        {CANVAS_KINDS.map((kk) => (
                          <button
                            key={kk.kind}
                            type="button"
                            role="menuitem"
                            onClick={() => { setCanvasSteps((s) => insertCanvasStep(s, edgeIndex, kk.kind)); setAddAt(null) }}
                          >
                            <strong>{kk.label}</strong><small>{kk.hint}</small>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
              {(() => {
                const last = canvasSteps[canvasSteps.length - 1]
                const ex = last ? last.pos.x + 272 : 60
                const ey = last ? last.pos.y : 260
                return (
                  <div className="n8n-end" style={{ left: ex, top: ey }}>
                    <button type="button" aria-label="Add step at the end" aria-expanded={addAt === canvasSteps.length} onClick={() => setAddAt((cur) => (cur === canvasSteps.length ? null : canvasSteps.length))}>
                      <span aria-hidden="true">+</span> Add step
                    </button>
                    {addAt === canvasSteps.length && (
                      <div className="n8n-menu" role="menu" aria-label="Add step at the end">
                        {CANVAS_KINDS.map((kk) => (
                          <button
                            key={kk.kind}
                            type="button"
                            role="menuitem"
                            onClick={() => { setCanvasSteps((s) => insertCanvasStep(s, s.length, kk.kind)); setAddAt(null) }}
                          >
                            <strong>{kk.label}</strong><small>{kk.hint}</small>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })()}
            </div>
            <p className="n8n-hint" aria-hidden="true">Drag nodes to arrange · drag background to pan · scroll to zoom · double-click empty canvas to add</p>
            {canvasDescribe && (
              <CanvasDescribeBar
                value={canvasPrompt}
                busy={canvasBusy}
                error={canvasError}
                onChange={(value) => { setCanvasPrompt(value); setCanvasError('') }}
                onSubmit={() => void submitCanvasDescribe()}
                onClose={() => { setCanvasDescribe(false); setCanvasError('') }}
              />
            )}
            {selectedStep && (
              <div className="n8n-inspector" aria-label={`Configure step ${selectedStep.title}`}>
                <form className="canvas-editor" onSubmit={saveStepEdit}>
                  <h3>Step {canvasSteps.findIndex((s) => s.id === selectedStep.id) + 1} · {selectedStep.title}</h3>
                  <label className="canvas-label" htmlFor="canvas-kind">App</label>
                  <select id="canvas-kind" className="canvas-select" value={editKind} onChange={(e) => setEditKind(e.currentTarget.value as CanvasKind)}>
                    {CANVAS_KINDS.map((k) => (
                      <option key={k.kind} value={k.kind}>{k.label} — {k.hint}</option>
                    ))}
                  </select>
                  {editKind === 'action' && (
                    <>
                      <label className="canvas-label" htmlFor="canvas-title">Action name</label>
                      <input id="canvas-title" value={editTitle} onChange={(e) => setEditTitle(e.currentTarget.value)} placeholder="Sheets, GitHub, Websearch…" />
                    </>
                  )}
                  <label className="canvas-label" htmlFor="canvas-event">Event</label>
                  <input id="canvas-event" value={editEvent} onChange={(e) => setEditEvent(e.currentTarget.value)} placeholder="What should this step do?" />
                  <div className="canvas-editor-row">
                    <button type="submit">Apply</button>
                    <button type="button" onClick={() => setSelectedStepId('')}>Done</button>
                  </div>
                </form>
              </div>
            )}
          </div>

        </div>
      )}
    </section>
  )
}
