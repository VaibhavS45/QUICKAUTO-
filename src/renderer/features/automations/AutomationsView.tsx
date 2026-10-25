import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FeatureProps } from '../../contracts/feature.js'
import type { RunRecord, ScheduleItem } from '../../../shared/contracts/schedule.js'
import type { Automation } from '../../../shared/contracts/automations.js'
import { addDaysKey, localDayKey, pastDayLabel, routineTitle, timeLabel } from './dates.js'
import {
  NODE_H,
  NODE_W,
  WORLD,
  branchLabel,
  canvasStepsForRoutine,
  canvasToCreate,
  canvasToPatch,
  directionPos,
  edgePath,
  edgeSourceIndex,
  insertCanvasStep,
  insertFromDirection,
  moveCanvasStep,
  moveStepTo,
  removeCanvasStep,
  tidyCanvasSteps,
  updateCanvasStep,
  type CanvasDirection,
  type CanvasStep
} from './canvas-steps.js'
import { parseAutomationCreate, parseAutomationTab, type AutomationTabId } from '../../shell/nav.js'
import { useBreadcrumbs, type BreadcrumbItem } from '../../components/layout/Breadcrumbs.js'
import CanvasDescribeBar from './canvas-describe.js'
import { formatDateTime } from '../../lib/format.js'
import ScheduledTasks from './ScheduledTasks.js'
import { MANAGE_FILTERS, automationMeta, type ManageFilter } from './scheduled.js'
import { ConfirmDialog } from './ConfirmDialog.js'
import { StatusBadge, UpdatesGlyph } from '../../components/ui/primitives.js'
import { CanvasNodeIcon, CanvasStepEditor, CanvasStepPicker, type CanvasPick, type CanvasPickTarget } from './canvas-picker.js'
import { readCanvasMemory, writeCanvasMemory, type CanvasMemory } from './canvas-memory.js'
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

interface ZapStep {
  kind: 'trigger' | 'action' | 'gmail'
  title: string
  subtitle: string
  filled: boolean
}

function errorText(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}

const DIRECTION_LABEL: Record<CanvasDirection, string> = {
  up: 'above',
  down: 'below',
  left: 'left of',
  right: 'right of'
}

/** localStorage in the renderer; a blocked store just forgets the preference. */
function canvasStorage(): Storage | undefined {
  try {
    return typeof window !== 'undefined' ? window.localStorage : undefined
  } catch {
    return undefined
  }
}

/** Canvas header title: the prompt without its @tool mentions. */
function canvasHeadTitle(prompt: string): string {
  const clean = routineTitle(prompt)
    .replace(/\s*@[a-z-]+/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
  return clean || 'Untitled automation'
}

function FilterIcon(): React.JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
      <path d="M2 3h12l-4.5 5.2V13l-3 1.2V8.2L2 3Z" strokeLinejoin="round" />
    </svg>
  )
}

/** Faint orbital drawing behind the graph: the canvas is a place, not a void. */
function CanvasBackdrop(): React.JSX.Element {
  return (
    <svg className="n8n-backdrop" viewBox="0 0 1200 700" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <radialGradient id="n8n-backdrop-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#7c8cff" stopOpacity="0.18" />
          <stop offset="55%" stopColor="#7c8cff" stopOpacity="0.05" />
          <stop offset="100%" stopColor="#7c8cff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="600" cy="340" rx="580" ry="340" fill="url(#n8n-backdrop-glow)" />
      <g fill="none" stroke="rgb(255 255 255 / 9%)" strokeWidth="1">
        <ellipse cx="600" cy="340" rx="430" ry="196" strokeDasharray="2 11" />
        <ellipse cx="600" cy="340" rx="640" ry="300" strokeDasharray="2 15" />
        <path d="M-40 480 C 220 260, 430 620, 700 400 S 1090 240, 1240 390" strokeDasharray="1 13" />
      </g>
      <g fill="none" stroke="rgb(255 154 92 / 16%)" strokeWidth="1.2" strokeLinecap="round">
        <path d="M120 252 C 288 186, 372 330, 540 252" strokeDasharray="3 10" />
        <path d="M812 442 C 956 372, 1008 528, 1160 456" strokeDasharray="3 10" />
      </g>
      <g fill="rgb(255 255 255 / 12%)">
        <circle cx="212" cy="430" r="2.5" />
        <circle cx="946" cy="216" r="2.5" />
        <circle cx="1042" cy="468" r="1.8" />
        <circle cx="360" cy="238" r="1.8" />
      </g>
      <g fill="rgb(255 154 92 / 45%)">
        <circle cx="120" cy="252" r="2" />
        <circle cx="1160" cy="456" r="2" />
      </g>
      <g fill="none" stroke="rgb(255 255 255 / 12%)" strokeWidth="1.4" strokeLinecap="round">
        <path d="M212 430h22M946 216h18M360 238h14" strokeDasharray="1 5" />
      </g>
    </svg>
  )
}

/** Canvas tab opener: create a new graph, or jump back into a previous one. */
export function CanvasLanding({ automations, resume = false, onResumeChange, onNew, onEdit }: {
  automations: Automation[]
  resume?: boolean
  onResumeChange?(next: boolean): void
  onNew(): void
  onEdit(id: string): void
}): React.JSX.Element {
  return (
    <div className="automations-canvas is-canvas-landing">
      <CanvasBackdrop />
      <div className="canvas-landing">
        <div className="canvas-landing-intro">
          <span className="canvas-landing-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="12" width="8" height="8" rx="2" />
              <rect x="21" y="3.5" width="8" height="8" rx="2" />
              <rect x="21" y="20.5" width="8" height="8" rx="2" />
              <path d="M11 16h4.5V7.5H21M15.5 16v8.5H21" />
            </svg>
          </span>
          <h2>Build an automation</h2>
          <p>Wire triggers, conditions and actions in any direction. Canvas automations show up in Manage.</p>
          <button type="button" className="canvas-landing-new" onClick={onNew}>
            <span aria-hidden="true">+</span> Create
          </button>
        </div>
        <div className="canvas-landing-recent">
          <h3>Edit previous</h3>
          {automations.length === 0 ? (
            <p className="canvas-landing-empty">Nothing here yet. Create one and it will show up here.</p>
          ) : (
            <div className="canvas-landing-list">
              {automations.map((automation) => (
                <button
                  key={automation.id}
                  type="button"
                  aria-label={`Edit ${automation.title}`}
                  onClick={() => onEdit(automation.id)}
                >
                  <span className="canvas-landing-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="6" height="6" rx="1.5" />
                      <rect x="15" y="15" width="6" height="6" rx="1.5" />
                      <path d="M9 6h5a3 3 0 0 1 3 3v6" />
                      <path d="m14.5 12.5 2.5 2.5 2.5-2.5" />
                    </svg>
                  </span>
                  <span className="canvas-landing-copy">
                    <strong>{automation.title}</strong>
                    <small>{automationMeta(automation)}</small>
                  </span>
                  <span className="canvas-landing-go" aria-hidden="true">→</span>
                </button>
              ))}
            </div>
          )}
          <label className="canvas-landing-resume">
            <input
              type="checkbox"
              checked={resume}
              onChange={(event) => onResumeChange?.(event.currentTarget.checked)}
            />
            <span className="canvas-landing-switch" aria-hidden="true" />
            <span>
              Always open my last canvas
              <small>Skip this screen next time.</small>
            </span>
          </label>
        </div>
      </div>
    </div>
  )
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
          <div className="p-rail">
            {dayRuns.map((run) => (
              <button
                key={run.id}
                type="button"
                className={`p-rail-item updates-row${run.status === 'running' ? ' is-running' : ''}`}
                onClick={() => onSelect(run)}
              >
                <span
                  className={`p-rail-dot${run.status === 'running' ? ' is-heat' : run.status === 'failed' ? ' is-failed' : run.status === 'succeeded' ? ' is-drawn' : ''}`}
                  aria-hidden="true"
                />
                <span className="updates-row-meta">
                  <span className="updates-row-icon" aria-hidden="true"><UpdatesGlyph /></span>
                  <strong>{routineTitle(run.title)}</strong>
                  <small>{timeLabel(run.endedAt ?? run.startedAt)}</small>
                </span>
                <span className="updates-row-body">{run.summary || 'No output recorded yet.'}</span>
              </button>
            ))}
          </div>
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
      <div className="automations-crumbbar">
        <button type="button" className="automations-backlink" onClick={onBack}>← Back</button>
      </div>
      <div className="automations-run">
        <article className="automations-run-main" aria-label={routineTitle(run.title)}>
          <p className="automations-detail-kicker">
            Output · {formatDateTime(run.startedAt)}
          </p>
          <h3>{routineTitle(run.title)}</h3>
          <p className={`automations-status is-${run.status}`}>{run.status.replaceAll('_', ' ')}</p>
          <StatusBadge status={run.status} />
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

/**
 * The trail of the automations view. The app shell renders it, once, top left.
 * The Updates section shows none: it is a feed, not a place in the tree.
 */
export function automationsTrail(tab: AutomationTabId, title: string | null): string[] {
  if (tab === 'updates') return []
  if (tab === 'canvas') return ['Canvas']
  if (title !== null) return ['Automations', title]
  return ['Manage']
}

export default function AutomationsView(props: FeatureProps): React.JSX.Element {
  // The tab and the open run are route-owned: a top-nav click replaces the
  // route params, so it always lands on the section the user picked.
  const tab = parseAutomationTab(props.initialAutomationTab) ?? 'manage'
  const createKind = parseAutomationCreate(props.initialStartKind)
  const [routines, setRoutines] = useState<Routine[]>([])
  const [automations, setAutomations] = useState<Automation[]>([])
  const [runs, setRuns] = useState<RunRecord[]>([])
  const [todayItems, setTodayItems] = useState<ScheduleItem[]>([])
  const [tomorrowItems, setTomorrowItems] = useState<ScheduleItem[]>([])
  const [todayKey] = useState(() => localDayKey())
  const [canvasSteps, setCanvasSteps] = useState<CanvasStep[]>(() => canvasStepsForRoutine(undefined))
  const [canvasKey, setCanvasKey] = useState('')
  const [selectedStepId, setSelectedStepId] = useState('')
  const [openStepMenuId, setOpenStepMenuId] = useState('')
  const [addAt, setAddAt] = useState<number | null>(null)
  const [vp, setVp] = useState({ x: 24, y: 0, z: 1 })
  const viewportRef = useRef<HTMLDivElement | null>(null)
  /** The canvas that was just created keeps the nodes it was built from. */
  const keepCanvasRef = useRef('')
  const dragRef = useRef<
    | { mode: 'pan'; sx: number; sy: number; ox: number; oy: number }
    | { mode: 'node'; id: string; dx: number; dy: number }
    | null
  >(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [manageFilter, setManageFilter] = useState<ManageFilter>('all')
  const [filterOpen, setFilterOpen] = useState(false)
  const filterWrapRef = useRef<HTMLDivElement | null>(null)
  const [manageDirty, setManageDirty] = useState(false)
  const [manageSelectedId, setManageSelectedId] = useState('')
  const [pendingTab, setPendingTab] = useState<AutomationTabId | null>(null)
  const [pendingLeave, setPendingLeave] = useState(false)
  const [canvasDescribe, setCanvasDescribe] = useState(false)
  const [canvasPrompt, setCanvasPrompt] = useState('')
  const [canvasBusy, setCanvasBusy] = useState(false)
  const [canvasError, setCanvasError] = useState('')
  /** The Canvas tab opens on a chooser; this flips once a graph is opened. */
  const [canvasStarted, setCanvasStarted] = useState(false)
  const [canvasMemory, setCanvasMemory] = useState<CanvasMemory>(() => readCanvasMemory(canvasStorage()))
  /** Set when the chooser was opened on purpose, so resume does not bounce back. */
  const [resumeSkipped, setResumeSkipped] = useState(false)
  const [addDir, setAddDir] = useState<{ id: string; dir: CanvasDirection } | null>(null)


  const tomorrowKey = addDaysKey(todayKey, 1)

  // The filter menu closes on Escape or a click outside, like the card menu.
  useEffect(() => {
    if (!filterOpen) return
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setFilterOpen(false)
    }
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as HTMLElement | null
      if (target && filterWrapRef.current?.contains(target)) return
      setFilterOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [filterOpen])

  const refresh = useCallback(async (): Promise<void> => {
    const [routineRes, runsRes, todayRes, tomorrowRes, automationsRes] = await Promise.all([
      window.app.routineList(),
      window.app.recentTasks(50),
      window.app.scheduleToday(),
      window.app.scheduleToday(tomorrowKey),
      window.app.automationsList()
    ])
    if (!routineRes.ok) throw new Error('Could not load automations.')
    if (!runsRes.ok || !runsRes.runs) throw new Error(runsRes.error || 'Could not load outputs.')
    if (!todayRes.ok || !todayRes.schedule) throw new Error(todayRes.error || 'Could not load today’s schedule.')
    if (!tomorrowRes.ok || !tomorrowRes.schedule) throw new Error(tomorrowRes.error || 'Could not load tomorrow’s schedule.')
    setRoutines(routineRes.routines as Routine[])
    if (automationsRes.ok && automationsRes.automations) setAutomations(automationsRes.automations)
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

  // "Advanced" starts describe an automation on the canvas instead of the builder.
  useEffect(() => {
    if (createKind !== 'advanced') return
    setCanvasStarted(true)
    setCanvasKey('blank')
    setCanvasSteps([])
    props.shell.navigate('automations', { automationTab: 'canvas' })
    setCanvasDescribe(true)
  }, [createKind, props.shell])

  // Leaving the tab forgets the open graph, so it reopens on the chooser (or
  // resumes the last one when that preference is on).
  useEffect(() => {
    if (tab === 'canvas') return
    setCanvasStarted(false)
    setResumeSkipped(false)
    setAddDir(null)
  }, [tab])

  // Route-driven tab switches ask before dropping unsaved edits.
  const routeTab = useRef(tab)
  useEffect(() => {
    if (routeTab.current === tab) return
    const next = tab
    routeTab.current = next
    if (manageDirty && next !== 'manage') {
      setPendingTab(next)
      props.shell.navigate('automations', { automationTab: 'manage' })
    }
  }, [tab, manageDirty, props.shell])

  // The open automation belongs to the Manage section: leaving it closes the detail.
  useEffect(() => {
    if (tab !== 'manage') setManageSelectedId('')
  }, [tab])

  // The detail page owns the top row: the filter and Create button would
  // only repeat what the breadcrumb already says.
  const manageDetailOpen = tab === 'manage' && manageSelectedId !== '' &&
    automations.some((automation) => automation.id === manageSelectedId)

  // Leaving the open automation asks before dropping unsaved edits. The flag
  // lives in a ref so the breadcrumb's click handler stays stable.
  const manageDirtyRef = useRef(manageDirty)
  manageDirtyRef.current = manageDirty
  const closeDetail = useCallback((): void => {
    if (manageDirtyRef.current) {
      setPendingLeave(true)
      return
    }
    setManageSelectedId('')
  }, [])

  // The trail of this screen. The app shell renders it, once, top left.
  const selectedAutomation = manageDetailOpen
    ? automations.find((automation) => automation.id === manageSelectedId) ?? null
    : null
  const trailLabels = automationsTrail(tab, selectedAutomation ? selectedAutomation.title : null)
  const trail = trailLabels.map((label, index): BreadcrumbItem => (
    index === 0 && trailLabels.length > 1 ? { label, onClick: closeDetail } : { label }
  ))
  useBreadcrumbs(trail)

  useEffect(() => {
    if (!props.focusId || routines.length === 0) return
    // Canvas-built automations open on the canvas, not in the Manage detail.
    if (automations.some((automation) => automation.id === props.focusId && automation.kind === 'advanced')) return
    const known =
      routines.some((routine) => routine.id === props.focusId) ||
      todayItems.some((item) => item.routineId === props.focusId) ||
      tomorrowItems.some((item) => item.routineId === props.focusId)
    if (!known) return
    if (tab !== 'manage') {
      props.shell.navigate('automations', { automationTab: 'manage', focusId: props.focusId })
    }
  }, [props.focusId, routines, automations, todayItems, tomorrowItems, tab, props.shell])

  /** "+ Create" belongs to the Automate section, not to Manage. */
  function goCreate(): void {
    props.shell.navigate('home', { startKind: 'choice' })
  }

  /** Remember which canvas to reopen, and whether to skip the chooser. */
  function saveCanvasMemory(next: CanvasMemory): void {
    setCanvasMemory(next)
    writeCanvasMemory(next, canvasStorage())
  }

  function rememberCanvas(id: string): void {
    saveCanvasMemory({ lastId: id, resume: canvasMemory.resume })
  }

  function setResumeCanvas(resume: boolean): void {
    // Stay on the chooser this visit; the setting applies the next time.
    setResumeSkipped(true)
    saveCanvasMemory({ lastId: canvasMemory.lastId, resume })
  }

  /** A fresh graph: no starter nodes, just the centered Add step. */
  function startNewCanvas(): void {
    fittedRef.current = false
    setCanvasStarted(true)
    setResumeSkipped(false)
    setCanvasKey('blank')
    setCanvasSteps([])
    setVp({ x: 24, y: 0, z: 1 })
    setCanvasPrompt('')
    setCanvasDescribe(false)
    setCanvasError('')
    setSelectedStepId('')
    setOpenStepMenuId('')
    setAddAt(null)
    setAddDir(null)
    if (props.focusId) props.shell.navigate('automations', { automationTab: 'canvas' })
  }

  /** Reopen a previous automation on the graph. */
  function openCanvas(id: string): void {
    fittedRef.current = false
    setCanvasStarted(true)
    setResumeSkipped(false)
    rememberCanvas(id)
    props.shell.navigate('automations', { automationTab: 'canvas', focusId: id })
  }

  /** Back to the chooser even when "always open my last canvas" is on. */
  function showCanvasLanding(): void {
    setCanvasStarted(false)
    setResumeSkipped(true)
    setAddDir(null)
    setAddAt(null)
    if (props.focusId) props.shell.navigate('automations', { automationTab: 'canvas' })
  }

  // "Always open my last canvas": skip the chooser and go straight back in.
  useEffect(() => {
    if (tab !== 'canvas' || canvasStarted || props.focusId || resumeSkipped) return
    if (!canvasMemory.resume || !canvasMemory.lastId) return
    if (!automations.some((automation) => automation.id === canvasMemory.lastId && automation.kind === 'advanced')) return
    openCanvas(canvasMemory.lastId)
  }, [tab, canvasStarted, props.focusId, resumeSkipped, canvasMemory, automations]) // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * The canvas takes free text, so the sentence becomes the first action and
   * the trigger node keeps the schedule. The result is a real automation, so
   * it shows up in Manage and reopens here when edited.
   */
  async function createCanvasAutomation(): Promise<void> {
    if (canvasBusy) return
    const text = canvasPrompt.trim()
    setCanvasBusy(true)
    setCanvasError('')
    try {
      const firstAction = canvasSteps.find((step) => step.kind !== 'trigger')
      const steps = text && firstAction ? updateCanvasStep(canvasSteps, firstAction.id, { subtitle: text }) : canvasSteps
      const title = canvasHeadTitle(text || firstAction?.subtitle || '')
      const input = canvasToCreate(steps, title)
      const res = await window.app.automationsCreate(text ? { ...input, prompt: text.slice(0, 20000) } : input)
      if (!res.ok || !res.automation) {
        setCanvasError(res.error || 'Could not create the automation.')
        return
      }
      await refresh()
      // The nodes on screen are what was just created: don't rebuild them.
      keepCanvasRef.current = res.automation.id
      setCanvasKey(res.automation.id)
      setCanvasSteps(steps)
      setCanvasPrompt('')
      setCanvasDescribe(false)
      rememberCanvas(res.automation.id)
      props.shell.navigate('automations', { automationTab: 'canvas', focusId: res.automation.id })
    } catch (reason) {
      setCanvasError(errorText(reason))
    } finally {
      setCanvasBusy(false)
    }
  }

  // "Always open my last canvas" resumes it without putting it in the route.
  const autoCanvas = canvasMemory.resume && !resumeSkipped && !canvasStarted && !props.focusId
    ? automations.find((automation) => automation.id === canvasMemory.lastId && automation.kind === 'advanced') ?? null
    : null
  // The canvas shows the automation in the route, else the remembered one.
  const canvasAutomation = automations.find((automation) => automation.id === props.focusId) ?? autoCanvas
  const canvasRoutine = canvasAutomation
    ? {
      prompt: canvasAutomation.prompt ?? canvasAutomation.title,
      tools: canvasAutomation.connectors,
      runAt: canvasAutomation.nextRunAt ? new Date(canvasAutomation.nextRunAt).getTime() : Date.now(),
      repeat: canvasAutomation.schedule?.type ?? 'daily'
    }
    : undefined
  const canvasRoutineKey = canvasAutomation?.id ?? 'blank'

  useEffect(() => {
    if (canvasRoutineKey === canvasKey) return
    setCanvasKey(canvasRoutineKey)
    if (keepCanvasRef.current === canvasRoutineKey) {
      keepCanvasRef.current = ''
      return
    }
    setCanvasSteps(canvasStepsForRoutine(canvasRoutine))
    setSelectedStepId('')
    setOpenStepMenuId('')
    setAddAt(null)
  }, [canvasRoutineKey, canvasKey, canvasRoutine])

  const selectedStep = useMemo(
    () => canvasSteps.find((s) => s.id === selectedStepId) ?? null,
    [canvasSteps, selectedStepId]
  )

  /** A step the user configured: Create can go ahead without a description. */
  const hasCanvasWork = canvasSteps.some((step) => step.kind !== 'trigger' && !/^select /i.test(step.subtitle))

  function pickStep(step: CanvasStep): void {
    setSelectedStepId(step.id)
  }

  /** Write the edited nodes back onto the automation they came from. */
  async function persistCanvas(steps: CanvasStep[]): Promise<void> {
    if (!canvasAutomation) return
    const patch = canvasToPatch(steps, canvasAutomation)
    if (Object.keys(patch).length === 0) return
    const res = await window.app.automationsUpdate(canvasAutomation.id, patch)
    if (!res.ok || !res.automation) {
      setError(res.error || 'Could not save the automation.')
      return
    }
    setAutomations((list) => list.map((item) => (item.id === res.automation!.id ? res.automation! : item)))
  }

  const stepsRef = useRef(canvasSteps)
  stepsRef.current = canvasSteps

  function addAtPoint(clientX: number, clientY: number): void {
    const w = toWorld(clientX, clientY)
    setCanvasSteps((steps) =>
      insertCanvasStep(steps, steps.length, 'action', { x: w.x - NODE_W / 2, y: w.y - NODE_H / 2 })
    )
  }

  /** Add-step panel picks: a trigger retargets step 1, the rest insert a node. */
  function addPickedStep(at: number, target: CanvasPickTarget, pick: CanvasPick): void {
    if (target === 'trigger') {
      const trigger = canvasSteps.find((step) => step.kind === 'trigger') ?? null
      if (trigger) {
        // The trigger keeps its schedule; the pick only changes which app starts it.
        const schedule = trigger.subtitle.includes('·') ? trigger.subtitle : 'daily · 9:00 am'
        setCanvasSteps((steps) => updateCanvasStep(steps, trigger.id, { kind: 'trigger', title: pick.title, subtitle: schedule }))
      } else {
        // A new graph starts with the trigger, at the slot the picker was opened from.
        setCanvasSteps((steps) => insertCanvasStep(steps, at, 'trigger', undefined, { title: pick.title, subtitle: 'daily · 9:00 am' }))
      }
      setAddAt(null)
      return
    }
    setCanvasSteps((steps) => insertCanvasStep(steps, at, pick.kind, undefined, { title: pick.title, subtitle: pick.subtitle }))
    setAddAt(null)
  }

  /** Add-step panel picks off a node handle: wire the new node back to its parent. */
  function addPickedFromDirection(dir: CanvasDirection, pick: CanvasPick): void {
    if (!addDir) return
    const parent = canvasSteps.find((step) => step.id === addDir.id)
    if (!parent) {
      setAddDir(null)
      return
    }
    const subtitle = pick.kind === 'trigger' ? 'daily · 9:00 am' : pick.subtitle
    setCanvasSteps((steps) => insertFromDirection(steps, parent.id, dir, pick.kind, { title: pick.title, subtitle }))
    setAddDir(null)
  }

  /** Step inspector save: update the node and write it back to the automation. */
  function applyStepEdit(patch: Partial<Pick<CanvasStep, 'kind' | 'title' | 'subtitle'>>): void {
    if (!selectedStep) return
    const next = updateCanvasStep(canvasSteps, selectedStep.id, patch)
    setCanvasSteps(next)
    void persistCanvas(next)
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
        setAddDir(null)
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

  const ZOOM_MIN = 0.35
  const ZOOM_MAX = 1.8

  /** Zoom about a viewport point so the spot under the cursor stays put. */
  function zoomAt(clientX: number, clientY: number, factor: number): void {
    const rect = viewportRef.current?.getBoundingClientRect()
    const px = clientX - (rect?.left ?? 0)
    const py = clientY - (rect?.top ?? 0)
    setVp((v) => {
      const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, v.z * factor))
      if (z === v.z) return v
      const ratio = z / v.z
      return { z, x: px - (px - v.x) * ratio, y: py - (py - v.y) * ratio }
    })
  }

  function zoomBy(factor: number): void {
    const rect = viewportRef.current?.getBoundingClientRect()
    zoomAt((rect?.left ?? 0) + (rect?.width ?? 0) / 2, (rect?.top ?? 0) + (rect?.height ?? 0) / 2, factor)
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
    const z = Math.max(ZOOM_MIN, Math.min(1.2, Math.min((vw - 80) / Math.max(1, maxX - minX), (vh - 80) / Math.max(1, maxY - minY))))
    setVp({ x: 48 - minX * z, y: vh / 2 - ((minY + maxY) / 2) * z, z })
  }

  // Trackpad: vertical swipe zooms, horizontal swipe pans; pinch is ignored
  // (its event stream was far too sensitive). Drag still pans.
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault()
      if (e.ctrlKey) return
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        setVp((v) => ({ ...v, x: v.x - e.deltaX }))
        return
      }
      const factor = Math.max(0.92, Math.min(1.08, Math.exp(-e.deltaY * 0.005)))
      zoomAt(e.clientX, e.clientY, factor)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [tab]) // eslint-disable-line react-hooks/exhaustive-deps

  // Frame the chain the first time the canvas is shown, so it never opens
  // jammed into the top-left corner.
  const fittedRef = useRef(false)
  useEffect(() => {
    if (tab !== 'canvas' || !canvasStarted || fittedRef.current || canvasSteps.length === 0) return
    const id = requestAnimationFrame(() => {
      fittedRef.current = true
      fitCanvas()
    })
    return () => cancelAnimationFrame(id)
  }, [tab, canvasStarted, canvasSteps.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const runId = props.focusRunId ?? ''
  const goUpdates = (): void => {
    props.shell.navigate('automations', { automationTab: 'updates' })
  }

  if (runId) {
    const run = runs.find((candidate) => candidate.id === runId)
    if (loading) {
      return (
        <section className="automations" aria-label="Run details">
          <div className="automations-crumbbar">
            <button type="button" className="automations-backlink" onClick={goUpdates}>← Back</button>
          </div>
          <p className="automations-empty">Loading run…</p>
        </section>
      )
    }
    if (!run) {
      return (
        <section className="automations" aria-label="Run details">
          <div className="automations-crumbbar">
            <button type="button" className="automations-backlink" onClick={goUpdates}>← Back</button>
          </div>
          <p className="automations-empty">This run is no longer available.</p>
        </section>
      )
    }
    return (
      <RunDetailPage
        run={run}
        runs={runs}
        onSelect={(next) => props.shell.navigate('automations', { automationTab: 'updates', focusRunId: next.id })}
        onBack={goUpdates}
      />
    )
  }

  return (
    <section className={`automations${tab === 'canvas' ? ' is-canvas-mode' : ''}`} aria-label="Automations">
      {tab === 'manage' && !manageDetailOpen && (
        <div className="automations-toolbar">
          <div className="automations-actions">
            <div className="automations-filter-wrap" ref={filterWrapRef}>
              <button
                type="button"
                className="automations-filter"
                aria-label="Filter automations"
                aria-haspopup="menu"
                aria-expanded={filterOpen}
                title="Filter automations"
                onClick={() => setFilterOpen((open) => !open)}
              >
                <FilterIcon />
              </button>
              {filterOpen && (
                <div className="automations-filter-menu" role="menu" aria-label="Filter automations">
                  {MANAGE_FILTERS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={manageFilter === option.id}
                      className={manageFilter === option.id ? 'is-active' : undefined}
                      onClick={() => {
                        setManageFilter(option.id)
                        setFilterOpen(false)
                      }}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button type="button" className="automations-create-btn" onClick={goCreate}>+ Create</button>
          </div>
        </div>
      )}

      {loading && <p className="automations-empty">Loading automations…</p>}
      {error && <p className="automations-error" role="alert">{error}</p>}

      {!loading && !error && tab === 'updates' && (
        <div className="automations-body updates-body">
          <UpdatesList
            runs={runs}
            todayKey={todayKey}
            onSelect={(run) => props.shell.navigate('automations', { automationTab: 'updates', focusRunId: run.id })}
          />
        </div>
      )}

      {!loading && !error && tab === 'manage' && (
        <div className="automations-body manage-body">
          <ScheduledTasks
            filter={manageFilter}
            focusAutomationId={props.focusId}
            selectedId={manageSelectedId}
            onSelect={(id) => {
              // Automations built on the canvas reopen there, not in the form.
              const target = automations.find((automation) => automation.id === id)
              if (target?.kind === 'advanced') {
                props.shell.navigate('automations', { automationTab: 'canvas', focusId: id })
                return
              }
              setManageSelectedId(id)
            }}
            onCreate={goCreate}
            onOpenRun={(runId) => props.shell.navigate('automations', { automationTab: 'updates', focusRunId: runId })}
            onDirtyChange={setManageDirty}
          />
        </div>
      )}

      {!loading && !error && tab === 'canvas' && !canvasStarted && !props.focusId && (
        <CanvasLanding
          automations={automations}
          resume={canvasMemory.resume}
          onResumeChange={setResumeCanvas}
          onNew={startNewCanvas}
          onEdit={openCanvas}
        />
      )}

      {!loading && !error && tab === 'canvas' && (canvasStarted || props.focusId) && (
        <div className="automations-canvas">
          <header className="canvas-head">
            <div className="canvas-head-text">
              <strong title={canvasRoutine ? routineTitle(canvasRoutine.prompt) : 'New automation'}>
                {canvasRoutine ? canvasHeadTitle(canvasRoutine.prompt) : 'New automation'}
              </strong>
              {canvasRoutine && <span className="canvas-head-meta">{canvasRoutine.repeat} · {timeLabel(canvasRoutine.runAt)}</span>}
            </div>
            <div className="canvas-head-actions">
              <button type="button" className="canvas-head-new" title="Pick another canvas" onClick={showCanvasLanding}>
                All
              </button>
              <button type="button" className="canvas-head-new" title="Start a new canvas" onClick={startNewCanvas}>
                <span aria-hidden="true">+</span> New
              </button>
              <button
                type="button"
                className="canvas-head-create"
                title="Turn this canvas into an automation"
                onClick={() => setCanvasDescribe(true)}
              >
                Create
              </button>
            </div>
          </header>
          <div
            className="n8n-viewport"
            ref={viewportRef}
            style={{
              backgroundSize: `${24 * vp.z}px ${24 * vp.z}px, ${120 * vp.z}px ${120 * vp.z}px, ${120 * vp.z}px ${120 * vp.z}px`,
              backgroundPosition: `${vp.x}px ${vp.y}px, ${vp.x}px ${vp.y}px, ${vp.x}px ${vp.y}px`
            }}
            onPointerDown={(e) => {
              if (!(e.target as HTMLElement).closest('.n8n-picker, .n8n-end, .n8n-empty, .n8n-dir')) {
                setAddAt(null)
                setAddDir(null)
              }
              beginPan(e)
            }}
            onDoubleClick={(e) => {
              if ((e.target as HTMLElement).closest('.n8n-node, .n8n-menu, .n8n-picker, .n8n-end, .n8n-empty, .n8n-dir, button, .n8n-toolbar, .n8n-inspector, .n8n-describe')) return
              addAtPoint(e.clientX, e.clientY)
            }}
            aria-label={canvasRoutine ? `Canvas for ${routineTitle(canvasRoutine.prompt)}` : 'Canvas builder'}
          >
            <CanvasBackdrop />
            <div className="n8n-toolbar" role="toolbar" aria-label="Canvas controls">
              <button type="button" aria-label="Zoom out" onClick={() => zoomBy(0.87)}>−</button>
              <span aria-hidden="true">{Math.round(vp.z * 100)}%</span>
              <button type="button" aria-label="Zoom in" onClick={() => zoomBy(1.15)}>+</button>
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
                {canvasSteps.map((step, i) => {
                  const sourceIndex = edgeSourceIndex(canvasSteps, i)
                  if (sourceIndex < 0) return null
                  const source = canvasSteps[sourceIndex]!
                  return (
                    <g key={`e-${source.id}-${step.id}`}>
                      <path d={edgePath(source.pos, step.pos)} fill="none" stroke="#8f8f96" strokeWidth="2" markerEnd="url(#n8n-arrow)" />
                      {step.branch && (
                        <text
                          className="n8n-edge-label"
                          x={(source.pos.x + step.pos.x + NODE_W) / 2}
                          y={(source.pos.y + step.pos.y + NODE_H) / 2}
                          textAnchor="middle"
                          dominantBaseline="middle"
                        >
                          {step.branch}
                        </text>
                      )}
                    </g>
                  )
                })}
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
                      <CanvasNodeIcon step={step} />
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
                  {(['right', 'down', 'left', 'up'] as const).map((dir) => {
                    const label = branchLabel(step, dir)
                    const open = addDir?.id === step.id && addDir.dir === dir
                    return (
                      <button
                        key={dir}
                        type="button"
                        className={`n8n-dir n8n-dir-${dir}${label ? ' has-label' : ''}`}
                        aria-label={`Add step ${DIRECTION_LABEL[dir]} step ${i + 1} ${step.title}`}
                        aria-expanded={open}
                        onClick={() => {
                          setAddAt(null)
                          setSelectedStepId('')
                          setAddDir(open ? null : { id: step.id, dir })
                        }}
                      >
                        <span aria-hidden="true">+</span>
                        {label && <small>{label}</small>}
                      </button>
                    )
                  })}
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
              {addDir && (() => {
                const parent = canvasSteps.find((step) => step.id === addDir.id)
                if (!parent) return null
                const pos = directionPos(parent, addDir.dir)
                return (
                  <div className="n8n-dir-picker" style={{ left: pos.x, top: pos.y }}>
                    <CanvasStepPicker
                      ariaLabel={`Add step to the ${addDir.dir}`}
                      zoom={vp.z}
                      onPick={(_target, pick) => addPickedFromDirection(addDir.dir, pick)}
                      onClose={() => setAddDir(null)}
                    />
                  </div>
                )
              })()}
              {canvasSteps.length > 0 && (() => {
                const last = canvasSteps[canvasSteps.length - 1]
                const ex = last ? last.pos.x + 272 : 60
                const ey = last ? last.pos.y : 260
                return (
                  <div className="n8n-end" style={{ left: ex, top: ey }}>
                    <button type="button" aria-label="Add step at the end" aria-expanded={addAt === canvasSteps.length} onClick={() => { setAddDir(null); setAddAt((cur) => (cur === canvasSteps.length ? null : canvasSteps.length)) }}>
                      <span aria-hidden="true">+</span> Add step
                    </button>
                    {addAt === canvasSteps.length && (
                      <CanvasStepPicker
                        ariaLabel="Add step at the end"
                        zoom={vp.z}
                        onPick={(target, pick) => addPickedStep(canvasSteps.length, target, pick)}
                        onClose={() => setAddAt(null)}
                      />
                    )}
                  </div>
                )
              })()}
            </div>
            {canvasSteps.length === 0 && (
              <div className="n8n-empty">
                <button
                  type="button"
                  aria-label="Add first step"
                  aria-expanded={addAt === 0}
                  onClick={() => { setAddDir(null); setAddAt((cur) => (cur === 0 ? null : 0)) }}
                >
                  <span aria-hidden="true">+</span> Add step
                </button>
                {addAt === 0 && (
                  <CanvasStepPicker
                    ariaLabel="Add first step"
                    zoom={vp.z}
                    initialTab="trigger"
                    onPick={(target, pick) => addPickedStep(0, target, pick)}
                    onClose={() => setAddAt(null)}
                  />
                )}
              </div>
            )}
            <p className="n8n-hint" aria-hidden="true">Drag from any side of a step to branch · swipe up/down to zoom · double-click empty canvas to add</p>
            {canvasDescribe && (
              <CanvasDescribeBar
                value={canvasPrompt}
                busy={canvasBusy}
                disabled={!canvasPrompt.trim() && !hasCanvasWork}
                error={canvasError}
                onChange={(value) => { setCanvasPrompt(value); setCanvasError('') }}
                onSubmit={() => void createCanvasAutomation()}
                onClose={() => { setCanvasDescribe(false); setCanvasError('') }}
              />
            )}
            {selectedStep && (
              <div className="n8n-inspector" aria-label={`Configure step ${selectedStep.title}`}>
                <CanvasStepEditor
                  key={selectedStep.id}
                  step={selectedStep}
                  index={canvasSteps.findIndex((s) => s.id === selectedStep.id) + 1}
                  onApply={applyStepEdit}
                  onClose={() => setSelectedStepId('')}
                />
              </div>
            )}
          </div>

        </div>
      )}

      {pendingTab && (
        <ConfirmDialog
          title="Leave without saving?"
          body="This automation has unsaved changes."
          confirmLabel="Leave"
          onCancel={() => setPendingTab(null)}
          onConfirm={() => {
            const target = pendingTab
            setPendingTab(null)
            setManageDirty(false)
            props.shell.navigate('automations', { automationTab: target })
          }}
        />
      )}
      {pendingLeave && (
        <ConfirmDialog
          title="Leave without saving?"
          body="This automation has unsaved changes."
          confirmLabel="Leave"
          onCancel={() => setPendingLeave(false)}
          onConfirm={() => {
            setPendingLeave(false)
            setManageDirty(false)
            setManageSelectedId('')
          }}
        />
      )}
    </section>
  )
}
