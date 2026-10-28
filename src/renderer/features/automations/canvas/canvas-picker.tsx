import { useState } from 'react'
import { Boxes, Clock, Filter, FolderOpen, Globe, Plug, Table2, Terminal, Zap, type LucideIcon } from 'lucide-react'
import { TOOL_IDS, TOOL_META } from '../../../../shared/types.js'
import { formatTime } from '../../../lib/format.js'
import { TIMER_TRIGGER, TRIGGER_APPS, triggerApp } from '../trigger/trigger-events.js'
import { TriggerAppIcon } from '../trigger/trigger-icons.js'
import { parseRepeatTime, type CanvasKind, type CanvasStep, type Repeat } from './canvas-steps.js'

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

export const EXTRA_ACTION_APPS: CanvasPick[] = [
  { id: 'slack', label: 'Slack', hint: 'Send messages and search workspace', kind: 'action', title: 'Slack', subtitle: PLACEHOLDER },
  { id: 'outlook', label: 'Outlook', hint: 'Read and send Outlook emails', kind: 'action', title: 'Outlook', subtitle: PLACEHOLDER },
  { id: 'googlecalendar', label: 'Google Calendar', hint: 'Create and update events', kind: 'action', title: 'Google Calendar', subtitle: PLACEHOLDER },
  { id: 'googleworkspace', label: 'Google Drive', hint: 'Access and organize files', kind: 'action', title: 'Google Workspace', subtitle: PLACEHOLDER },
  { id: 'shopify', label: 'Shopify', hint: 'Manage orders and inventory', kind: 'action', title: 'Shopify', subtitle: PLACEHOLDER }
]

export const ACTION_CHOICES: CanvasPick[] = [...ACTION_PICKS, ...EXTRA_ACTION_APPS, ...LOGIC_PICKS]

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
export function CanvasStepPicker({ onPick, onClose, ariaLabel, zoom = 1, initialTab = 'step' }: {
  onPick(target: CanvasPickTarget, pick: CanvasPick): void
  onClose(): void
  ariaLabel: string
  zoom?: number
  initialTab?: CanvasPickTarget
}): React.JSX.Element {
  const [tab, setTab] = useState<CanvasPickTarget>(initialTab)
  const [query, setQuery] = useState('')

  const rows = (target: CanvasPickTarget): CanvasPick[] => {
    const picks = target === 'trigger' ? TRIGGER_PICKS : ACTION_CHOICES
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

export type { Repeat }

export const REPEAT_OPTIONS: { value: Repeat; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'once', label: 'Once' }
]

/** "09:00" → "9:00 AM", matching the schedule summaries elsewhere. */
export function clockLabel(clock: string): string {
  const [hours, minutes] = clock.split(':').map(Number)
  return formatTime(new Date(2000, 0, 1, Number.isFinite(hours) ? hours : 9, Number.isFinite(minutes) ? minutes : 0))
}

export const APP_ACTION_PRESETS: Record<string, string[]> = {
  gmail: [
    'Search unread emails and summarize them',
    'Send an email to recipient',
    'Draft a reply to the latest message',
    'Apply label to matching emails'
  ],
  slack: [
    'Post notification to #general channel',
    'Send a direct message with update',
    'Post thread reply to recent message'
  ],
  sheets: [
    'Add a new row with timestamp and data',
    'Update cell in active sheet',
    'Read rows and summarize metrics'
  ],
  notion: [
    'Create a new page in database',
    'Append notes to existing page',
    'Update database entry status to Done'
  ],
  googlecalendar: [
    'Create a new calendar event',
    'List schedule and upcoming meetings for today'
  ],
  github: [
    'Create a new issue with title and reproduction steps',
    'Fetch pull request diff and review changed files',
    'Create branch and submit a pull request with code fix',
    'Post review summary and findings comment on the PR',
    'Review open pull requests in repository'
  ],
  websearch: [
    'Search the web for latest news and summarize',
    'Research competitor pricing and trends'
  ],
  opencode: [
    'Analyze issue description, implement code fix, and verify tests pass',
    'Review PR diff for bugs, edge cases, security, and missing tests',
    'Inspect code repository and summarize recent commits',
    'Run test suite and report any failures'
  ],
  filter: [
    'email body contains "urgent"',
    'amount is greater than 100',
    'status equals "approved"'
  ],
  delay: [
    '15 minutes',
    '30 minutes',
    '1 hour',
    '1 day'
  ]
}

const FIELD_LABEL: Partial<Record<CanvasKind, string>> = {
  filter: 'Condition',
  delay: 'Wait',
  action: 'Do',
  gmail: 'Do'
}

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const TIME_PRESETS = ['09:00', '12:00', '17:00', '21:00']

function ordinalSuffix(n: number): string {
  const tail = n % 100
  if (tail >= 11 && tail <= 13) return 'th'
  return ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'
}

/**
 * Step inspector. A trigger edits its schedule or app event filters;
 * actions pick an app, action presets, and detailed instructions.
 */
export function CanvasStepEditor({ step, index, onApply, onClose }: {
  step: CanvasStep
  /** 1-based position in the chain. */
  index: number
  onApply(patch: Partial<CanvasStep>): void
  onClose(): void
}): React.JSX.Element {
  const isTrigger = step.kind === 'trigger'
  const schedule = parseRepeatTime(step.subtitle)
  const [repeat, setRepeat] = useState<Repeat>((step.schedule?.type as Repeat) ?? schedule.repeat)
  const [time, setTime] = useState(step.schedule?.time ?? schedule.time)
  const [weekdays, setWeekdays] = useState<number[]>(() => step.schedule?.weekdays ?? [1, 2, 3, 4, 5])
  const [date, setDate] = useState<string>(() => step.schedule?.date ?? new Date().toISOString().slice(0, 10))
  const [dayOfMonth, setDayOfMonth] = useState<number>(() => step.schedule?.dayOfMonth ?? new Date().getDate())
  const [kind, setKind] = useState<CanvasKind>(step.kind)
  const [title, setTitle] = useState(step.title)
  const [event, setEvent] = useState(step.actionPrompt || (/^select the/i.test(step.subtitle) ? '' : step.subtitle))

  // Trigger app & event support
  const activeTriggerApp = TRIGGER_APPS.find((app) => app.label.toLowerCase() === title.toLowerCase() || app.id === title.toLowerCase())
  const isEventInitially = isTrigger && Boolean(activeTriggerApp) && title.toLowerCase() !== 'schedule'
  const [triggerMode, setTriggerMode] = useState<'schedule' | 'event'>(isEventInitially ? 'event' : 'schedule')
  const availableEvents = activeTriggerApp?.events ?? []
  const initialEventId = availableEvents.find((e) => e.phrase === step.event)?.id ?? availableEvents[0]?.id ?? ''
  const [selectedEventId, setSelectedEventId] = useState<string>(initialEventId)
  const activeEvent = availableEvents.find((e) => e.id === selectedEventId) ?? availableEvents[0]
  const [config, setConfig] = useState<Record<string, string>>(() => ({ ...(step.config ?? {}) }))

  const active = ACTION_CHOICES.find((pick) => pick.kind === kind && pick.title === title)
  const headerApp = TRIGGER_PICKS.find((pick) => pick.title === title)

  function chooseApp(pick: CanvasPick): void {
    setKind(pick.kind)
    setTitle(pick.title)
    if (!event.trim()) setEvent(pick.kind === 'filter' || pick.kind === 'delay' ? pick.subtitle : '')
  }

  function chooseTriggerApp(pick: CanvasPick): void {
    setTitle(pick.title)
    const app = TRIGGER_APPS.find((a) => a.id === pick.id || a.label.toLowerCase() === pick.title.toLowerCase())
    if (app && app.events.length > 0) {
      setSelectedEventId(app.events[0]!.id)
      setConfig({})
    }
  }

  function schedulePreview(): string {
    const timeStr = clockLabel(time)
    if (repeat === 'daily') return `Runs every day at ${timeStr}`
    if (repeat === 'weekly') {
      const dayNames = weekdays.length > 0 ? [...weekdays].sort((a, b) => a - b).map((d) => WEEKDAY_LABELS[d]).join(', ') : 'No days selected'
      return `Runs every week on ${dayNames} at ${timeStr}`
    }
    if (repeat === 'monthly') return `Runs monthly on the ${dayOfMonth}${ordinalSuffix(dayOfMonth)} at ${timeStr}`
    return `Runs once on ${date} at ${timeStr}`
  }

  function eventPreview(): string {
    const ev = activeEvent?.label ?? 'event occurs'
    const entries = Object.entries(config).filter(([, v]) => v && v.trim())
    const filterStr = entries.map(([k, v]) => `${k}='${v}'`).join(', ')
    return `When ${ev}${filterStr ? ` (${filterStr})` : ''} in ${activeTriggerApp?.label ?? 'app'} · checked ${repeat} at ${clockLabel(time)}`
  }

  function submit(e: React.FormEvent): void {
    e.preventDefault()
    if (isTrigger) {
      const scheduleObj = {
        type: repeat,
        time,
        ...(repeat === 'weekly' ? { weekdays: weekdays.length ? weekdays : [1] } : {}),
        ...(repeat === 'once' ? { date } : {}),
        ...(repeat === 'monthly' ? { dayOfMonth } : {})
      }

      if (triggerMode === 'event' && activeTriggerApp && activeEvent) {
        const entries = Object.entries(config).filter(([, v]) => v && v.trim())
        const filterStr = entries.map(([k, v]) => `${k}='${v}'`).join(', ')
        const sub = `When ${activeEvent.phrase}${filterStr ? ` (${filterStr})` : ''} · ${schedulePreview()}`
        onApply({
          kind: 'trigger',
          title: activeTriggerApp.label,
          event: activeEvent.phrase,
          config,
          schedule: scheduleObj,
          subtitle: sub,
          filled: true
        })
      } else {
        onApply({
          kind: 'trigger',
          title: 'Schedule',
          schedule: scheduleObj,
          subtitle: schedulePreview(),
          filled: true
        })
      }
      return
    }

    const fallback = kind === 'filter' ? 'Only continue if conditions match' : kind === 'delay' ? 'Wait before running the next step' : 'Select the app and event'
    const finalSubtitle = event.trim() || fallback
    onApply({
      kind,
      title: title.trim() || 'Action',
      subtitle: finalSubtitle,
      actionPrompt: event.trim(),
      filled: Boolean(event.trim())
    })
  }

  const presets = APP_ACTION_PRESETS[title.toLowerCase()] ?? APP_ACTION_PRESETS[kind] ?? []

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
          {/* Segmented control for Trigger type */}
          <div className="canvas-trigger-type-tabs" role="tablist" aria-label="Trigger type">
            <button
              type="button"
              className={`canvas-trigger-type-tab ${triggerMode === 'schedule' ? 'is-active' : ''}`}
              role="tab"
              aria-selected={triggerMode === 'schedule'}
              onClick={() => {
                setTriggerMode('schedule')
                setTitle('Schedule')
              }}
            >
              <Clock size={13} aria-hidden="true" />
              <span>Schedule Timer</span>
            </button>
            <button
              type="button"
              className={`canvas-trigger-type-tab ${triggerMode === 'event' ? 'is-active' : ''}`}
              role="tab"
              aria-selected={triggerMode === 'event'}
              onClick={() => {
                setTriggerMode('event')
                if (!activeTriggerApp) {
                  setTitle('Gmail')
                }
              }}
            >
              <Zap size={13} aria-hidden="true" />
              <span>App Event</span>
            </button>
          </div>

          {triggerMode === 'event' ? (
            <>
              <span className="canvas-label">Connected App</span>
              <div className="canvas-apps" role="group" aria-label="Trigger app">
                {TRIGGER_PICKS.filter((p) => p.id !== TIMER_TRIGGER.id).map((pick) => (
                  <button
                    key={pick.id}
                    type="button"
                    className="canvas-app"
                    aria-pressed={title.toLowerCase() === pick.title.toLowerCase()}
                    title={pick.hint}
                    onClick={() => chooseTriggerApp(pick)}
                  >
                    <span aria-hidden="true">{iconFor(pick.id, pick.kind, 16)}</span>
                    {pick.label}
                  </button>
                ))}
              </div>

              {activeTriggerApp && (
                <>
                  <label className="canvas-label" htmlFor="canvas-event-select" style={{ marginTop: 8 }}>
                    When this happens in {activeTriggerApp.label}
                  </label>
                  <select
                    id="canvas-event-select"
                    className="canvas-select"
                    value={selectedEventId}
                    onChange={(e) => {
                      setSelectedEventId(e.currentTarget.value)
                      setConfig({})
                    }}
                  >
                    {activeTriggerApp.events.map((ev) => (
                      <option key={ev.id} value={ev.id}>{ev.label}</option>
                    ))}
                  </select>

                  {activeEvent?.config && activeEvent.config.length > 0 && (
                    <div className="canvas-event-configs" style={{ marginTop: 8 }}>
                      <span className="canvas-label">Filter criteria</span>
                      {activeEvent.config.map((field) => (
                        <div key={field.key} style={{ marginTop: 6 }}>
                          <label style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>
                            {field.label}
                          </label>
                          {field.options ? (
                            <select
                              className="canvas-select"
                              value={config[field.key] ?? ''}
                              onChange={(e) => setConfig((prev) => ({ ...prev, [field.key]: e.currentTarget.value }))}
                            >
                              <option value="">{field.placeholder}</option>
                              {field.options.map((opt) => (
                                <option key={opt} value={opt}>{opt}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              className="canvas-input"
                              placeholder={field.placeholder}
                              value={config[field.key] ?? ''}
                              onChange={(e) => setConfig((prev) => ({ ...prev, [field.key]: e.currentTarget.value }))}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          ) : null}

          <label className="canvas-label" htmlFor="canvas-repeat" style={{ marginTop: 10 }}>
            {triggerMode === 'event' ? 'Check Schedule' : 'Repeat Schedule'}
          </label>
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

          {/* If weekly, render weekday toggle pills */}
          {repeat === 'weekly' && (
            <div style={{ marginTop: 8 }}>
              <span className="canvas-label">On Days</span>
              <div className="canvas-weekdays-row">
                {WEEKDAY_LABELS.map((label, day) => {
                  const isChecked = weekdays.includes(day)
                  return (
                    <button
                      key={label}
                      type="button"
                      className="canvas-weekday-pill"
                      aria-pressed={isChecked}
                      onClick={() => {
                        setWeekdays((cur) =>
                          isChecked ? cur.filter((d) => d !== day) : [...cur, day]
                        )
                      }}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* If once, render date input */}
          {repeat === 'once' && (
            <div style={{ marginTop: 8 }}>
              <label className="canvas-label" htmlFor="canvas-date">Date</label>
              <input
                id="canvas-date"
                type="date"
                className="canvas-input"
                value={date}
                onChange={(e) => setDate(e.currentTarget.value)}
              />
            </div>
          )}

          {/* If monthly, render day of month */}
          {repeat === 'monthly' && (
            <div style={{ marginTop: 8 }}>
              <label className="canvas-label" htmlFor="canvas-month-day">Day of month</label>
              <input
                id="canvas-month-day"
                type="number"
                min="1"
                max="31"
                className="canvas-input"
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(Math.max(1, Math.min(31, Number(e.currentTarget.value) || 1)))}
              />
            </div>
          )}

          {/* Quick time presets */}
          <div style={{ marginTop: 8 }}>
            <span className="canvas-label">Quick Times</span>
            <div className="canvas-time-presets">
              {TIME_PRESETS.map((t) => (
                <button
                  key={t}
                  type="button"
                  className="canvas-time-preset"
                  onClick={() => setTime(t)}
                >
                  {clockLabel(t)}
                </button>
              ))}
            </div>
          </div>

          {/* Summary preview box */}
          <div className="canvas-trigger-preview">
            <strong>{triggerMode === 'event' ? 'Event Trigger Summary' : 'Schedule Summary'}</strong>
            {triggerMode === 'event' ? eventPreview() : schedulePreview()}
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
                aria-pressed={active?.id === pick.id || title.toLowerCase() === pick.title.toLowerCase()}
                title={pick.hint}
                onClick={() => chooseApp(pick)}
              >
                <span aria-hidden="true">{iconFor(pick.id, pick.kind, 16)}</span>
                {pick.label}
              </button>
            ))}
          </div>

          {presets.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <span className="canvas-label">Suggestions</span>
              <div className="canvas-preset-chips">
                {presets.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className="canvas-preset-chip"
                    onClick={() => setEvent(preset)}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
          )}

          <label className="canvas-label" htmlFor="canvas-event" style={{ marginTop: 8 }}>
            {FIELD_LABEL[kind] ?? 'Do'}
          </label>
          {kind === 'filter' || kind === 'delay' ? (
            <input
              id="canvas-event"
              className="canvas-input"
              value={event}
              onChange={(e) => setEvent(e.currentTarget.value)}
              placeholder={kind === 'filter' ? 'Only continue if…' : 'Wait 30 minutes'}
            />
          ) : (
            <textarea
              id="canvas-event"
              value={event}
              onChange={(e) => setEvent(e.currentTarget.value)}
              placeholder="What should this step do? e.g. Summarize the unread emails and send a Slack notification"
              rows={3}
            />
          )}
        </>
      )}

      <div className="canvas-editor-row" style={{ marginTop: 12 }}>
        <button type="submit">Apply</button>
        <button type="button" onClick={onClose}>Done</button>
      </div>
    </form>
  )
}
