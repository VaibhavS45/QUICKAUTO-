import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FeatureProps } from '../../contracts/feature.js'
import type { RunRecord, ScheduleItem } from '../../../shared/contracts/schedule.js'
import { addDaysKey, dayLabel, localDayKey, monthGrid, monthLabel, routineOccursOn, routineTitle, timeLabel } from './dates.js'
import {
  NODE_H,
  NODE_W,
  WORLD,
  blankStep,
  canvasStepsForRoutine,
  describeRoutine,
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
import { blankDraft, templateToDraft, type BuilderDraft } from './builder-compile.js'
import Builder from './builder.js'
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

export default function AutomationsView(props: FeatureProps): React.JSX.Element {
  const [tab, setTab] = useState<'updates' | 'manage' | 'canvas'>('manage')
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
  const [openMenuId, setOpenMenuId] = useState('')

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
  useEffect(() => {
    if (!props.initialTemplate || openedTemplate.current === props.initialTemplate.id) return
    openedTemplate.current = props.initialTemplate.id
    setBuilderInitial(templateToDraft(props.initialTemplate))
    setBuilderOpen(true)
  }, [props.initialTemplate])

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
        setSelection({ kind: 'routine', routine: created })
      }
      return null
    } catch (reason) {
      return errorText(reason)
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
      setOpenMenuId('')
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

  return (
    <section className="automations" aria-label="Automations">
      <div className="automations-toolbar">
        <nav aria-label="Automation sections" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'updates'} onClick={() => setTab('updates')}>Updates</button>
          <button type="button" role="tab" aria-selected={tab === 'manage'} onClick={() => setTab('manage')}>Manage</button>
          <button type="button" role="tab" aria-selected={tab === 'canvas'} onClick={() => setTab('canvas')}>Canvas</button>
        </nav>
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
          <button type="button" className="automations-create-btn" onClick={() => { setBuilderInitial(blankDraft()); setBuilderOpen(true) }}>+ Create</button>
        </div>
      </div>

      {builderOpen && (
        <Builder
          initial={builderInitial}
          gmailConnected={gmailConnected}
          onConnect={() => props.shell.openSettings('connectors')}
          onClose={() => setBuilderOpen(false)}
          onSubmit={submitBuilder}
        />
      )}

      {loading && <p className="automations-empty">Loading automations…</p>}
      {error && <p className="automations-error" role="alert">{error}</p>}

      {!loading && !error && tab === 'updates' && view === 'list' && (
        <div className="automations-body">
          <div className="automations-main">
            {runs.length === 0 && <p className="automations-empty">No outputs yet. Run an automation to see results here.</p>}
            {runs.map((run) => (
              <button
                key={run.id}
                type="button"
                className="automations-output"
                onClick={() => setSelection({ kind: 'run', run })}
              >
                <span className={`automations-dot is-${run.status}`} />
                <span className="automations-output-text">
                  <strong>{routineTitle(run.title)}</strong>
                  <small>{new Date(run.endedAt ?? run.startedAt).toLocaleString()} · {run.status.replaceAll('_', ' ')}</small>
                  {run.summary && <span>{run.summary.slice(0, 140)}{run.summary.length > 140 ? '…' : ''}</span>}
                </span>
              </button>
            ))}
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
        <div className="automations-body">
          <div className="automations-grid">
            {visibleRoutines.length === 0 && <p className="automations-empty">No automations yet. Use Create to add one.</p>}
            {visibleRoutines.map((routine) => (
              <article key={routine.id} className="automations-card">
                <header>
                  <span className="automations-card-icon" aria-hidden="true">⚙</span>
                  <span className={`automations-status is-${routine.enabled ? 'active' : 'paused'}`}>
                    <span className={`automations-dot ${routine.enabled ? 'is-succeeded' : 'is-cancelled'}`} />{routine.enabled ? 'Active' : 'Paused'}
                  </span>
                  <button
                    type="button"
                    aria-label={`Options for ${routineTitle(routine.prompt)}`}
                    aria-expanded={openMenuId === routine.id}
                    onClick={() => setOpenMenuId((current) => (current === routine.id ? '' : routine.id))}
                  >
                    …
                  </button>
                </header>
                {openMenuId === routine.id && (
                  <div className="automations-menu" role="menu">
                    <button type="button" role="menuitem" onClick={() => void toggleRoutine(routine)}>
                      {routine.enabled ? 'Pause' : 'Resume'}
                    </button>
                    <button type="button" role="menuitem" onClick={() => void removeRoutine(routine)}>Delete</button>
                  </div>
                )}
                <button type="button" className="automations-card-body" onClick={() => setSelection({ kind: 'routine', routine })}>
                  <small>{describeRoutine(routine)}</small>
                  <strong>{routineTitle(routine.prompt)}</strong>
                  <span>{routine.prompt.length > 140 ? `${routine.prompt.slice(0, 140)}…` : routine.prompt}</span>
                </button>
              </article>
            ))}
          </div>
          {detail}
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
              if ((e.target as HTMLElement).closest('.n8n-node, .n8n-menu, .n8n-edge-add, .n8n-end, button, .n8n-toolbar, .n8n-topbar, .n8n-inspector')) return
              addAtPoint(e.clientX, e.clientY)
            }}
            aria-label={canvasRoutine ? `Canvas for ${routineTitle(canvasRoutine.prompt)}` : 'Canvas builder'}
          >
            <div className="n8n-topbar">
              <span className="n8n-status">
                {canvasRoutine ? `${routineTitle(canvasRoutine.prompt)} · ${canvasRoutine.repeat} · ${timeLabel(canvasRoutine.runAt)}` : 'Blank canvas'}
              </span>
              {/* ponytail: static until the automation builder lands; wire to it then */}
              <button type="button" className="n8n-create" disabled title="Automation builder coming next">Create</button>
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
