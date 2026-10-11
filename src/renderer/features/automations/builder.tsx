import { useEffect, useMemo, useRef, useState } from 'react'
import { TOOL_IDS, TOOL_META, type ActiveToolId } from '../../../shared/types.js'
import { GMAIL_EVENTS } from './trigger-events.js'
import { draftToText, makeTriggerId, type BuilderDraft, type BuilderRepeat, type BuilderTrigger } from './builder-compile.js'
import type { AgentEvent } from '../../../shared/agent.js'
import type { RunRecord } from '../../../shared/contracts/schedule.js'
import BuilderConnectorPopover from './BuilderConnectorPopover.js'
import './automations.css'
import './builder-opencode.css'

interface BuilderProps {
  initial: BuilderDraft
  gmailConnected: boolean | undefined
  onConnect(): void
  onClose(): void
  /** Resolves with an error message, or null on success. */
  onSubmit(text: string): Promise<string | null>
}

const REPEATS: { value: BuilderRepeat; label: string }[] = [
  { value: 'once', label: 'Once' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekdays', label: 'Weekdays' }
]

const REPEAT_OPTIONS: { value: BuilderRepeat; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekdays', label: 'Weekly' },
  { value: 'once', label: 'Monthly' },
  { value: 'once', label: 'No Repeat' }
]

const HOURS_LIST = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12']
const MINUTES_LIST = ['00', '15', '30', '45']

/** Half-hour slots labeled like "AM 9:00" (screenshot spec), valued as 24h HH:MM. */
const TIME_SLOTS: { value: string; label: string }[] = (() => {
  const slots: { value: string; label: string }[] = []
  for (let h = 0; h < 24; h += 1) {
    for (const m of [0, 30]) {
      const value = `${String(h).padStart(2, '0')}:${m === 0 ? '00' : '30'}`
      const h12 = h % 12 === 0 ? 12 : h % 12
      slots.push({ value, label: `${h >= 12 ? 'PM' : 'AM'} ${h12}:${m === 0 ? '00' : '30'}` })
    }
  }
  return slots
})()

function GmailMark(): React.JSX.Element {
  return (
    <svg width="20" height="16" viewBox="0 0 20 16" fill="none" aria-hidden="true">
      <path d="M2 2.5v11" stroke="#EA4335" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M2.5 3.5 10 9.5" stroke="#FBBC05" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M17.5 3.5 10 9.5" stroke="#34A853" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M18 2.5v11" stroke="#4285F4" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M2 13.5h16" stroke="#4285F4" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}

function TrashIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M2.5 4h11M6.5 4V2.8c0-.4.4-.8.8-.8h1.4c.4 0 .8.4.8.8V4M4 4l.7 9.2c0 .4.4.8.8.8h5c.4 0 .8-.4.8-.8L12 4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ClockIcon(): React.JSX.Element {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <circle cx="9" cy="9" r="7" />
      <path d="M9 5.5V9l2.5 1.5" strokeLinecap="round" />
    </svg>
  )
}

function patchTrigger(setTriggers: React.Dispatch<React.SetStateAction<BuilderTrigger[]>>, id: string, patch: Partial<BuilderTrigger>): void {
  setTriggers((cur) => cur.map((t) => (t.id === id ? { ...t, ...patch } : t)))
}

export default function Builder(props: BuilderProps): React.JSX.Element {
  const [mode] = useState(props.initial.mode)
  const [triggers, setTriggers] = useState(props.initial.triggers)
  const [task, setTask] = useState(props.initial.task)
  const [describe, setDescribe] = useState(props.initial.describe)
  const [tools, setTools] = useState<string[]>(props.initial.tools)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [skillsSubmenuOpen, setSkillsSubmenuOpen] = useState(false)
  const [recentTasksSubmenuOpen, setRecentTasksSubmenuOpen] = useState(false)
  const [recentTasks, setRecentTasks] = useState<RunRecord[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Custom Dropdown Menus State (for timing & connectors)
  const [openRepeatId, setOpenRepeatId] = useState<string | null>(null)
  const [openTimeId, setOpenTimeId] = useState<string | null>(null)
  const [connectorMenuOpen, setConnectorMenuOpen] = useState(false)

  // OpenCode ACP Execution State
  const [working, setWorking] = useState(false)
  const [currentRunId, setCurrentRunId] = useState('')
  const [streamedResponse, setStreamedResponse] = useState('')
  const [activeToolEvents, setActiveToolEvents] = useState<string[]>([])
  const [runDone, setRunDone] = useState(false)
  const [copied, setCopied] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const unsubRef = useRef<(() => void) | null>(null)

  const compiled = useMemo(
    () => draftToText(mode === 'describe'
      ? { mode, title: '', triggers: [], task: '', describe, tools: [] }
      : { mode: 'manual', title: props.initial.title, triggers, task, describe: '', tools }),
    [mode, props.initial.title, triggers, task, describe, tools]
  )

  useEffect(() => {
    return () => {
      if (unsubRef.current) unsubRef.current()
    }
  }, [])

  // Listen for agent events during run
  useEffect(() => {
    if (!working || !currentRunId) return

    const unsub = window.app.onAgentEvent((event: AgentEvent) => {
      if (event.runId !== currentRunId) return

      if (event.type === 'text-delta') {
        setStreamedResponse((prev) => prev + event.delta)
      } else if (event.type === 'tool-call') {
        setActiveToolEvents((prev) => [...prev, event.toolName])
      } else if (event.type === 'done') {
        setWorking(false)
        setRunDone(true)
        if (event.text) {
          setStreamedResponse(event.text)
        }
        // Save routine to scheduler
        void props.onSubmit(compiled.text)
      } else if (event.type === 'error') {
        setWorking(false)
        setError(event.message || 'OpenCode execution error occurred.')
      } else if (event.type === 'aborted') {
        setWorking(false)
        setError('OpenCode execution was cancelled.')
      }
    })

    unsubRef.current = unsub
    return () => {
      unsub()
    }
  }, [working, currentRunId, compiled.text, props])

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    if (!compiled.valid || busy || working) return

    setBusy(true)
    setError('')
    setStreamedResponse('')
    setActiveToolEvents([])
    setRunDone(false)
    setWorking(true)

    try {
      // 1. Ensure OpenCode engine is selected
      try {
        await window.app.setAgentProvider('opencode')
      } catch {
        // Fall back gracefully to active provider
      }

      // 2. Start agent run connected to OpenCode ACP client
      const promptText = mode === 'describe' ? describe : compiled.text
      const res = await window.app.agentRun({
        prompt: promptText,
        tools: tools,
        source: 'chat'
      })

      if (!res.ok || !res.runId) {
        throw new Error(res.error || 'Could not start OpenCode ACP client.')
      }

      setCurrentRunId(res.runId)
    } catch (reason) {
      setWorking(false)
      setBusy(false)
      setError(reason instanceof Error ? reason.message : String(reason))
    }
  }

  function handleCancelRun(): void {
    if (currentRunId) {
      void window.app.agentCancel(currentRunId)
    }
    setWorking(false)
    setBusy(false)
  }

  function toggleTool(id: ActiveToolId): void {
    setTools((cur) => (cur.includes(id) ? cur.filter((t) => t !== id) : [...cur, id]))
  }

  function addEventTrigger(phrase: string): void {
    setTriggers((cur) => [...cur, { id: makeTriggerId(), kind: 'event', repeat: 'daily', time: '09:00', app: 'gmail', event: phrase }])
    setPickerOpen(false)
  }

  function handleLocalFilesClick(): void {
    setAddMenuOpen(false)
    fileInputRef.current?.click()
  }

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>): void {
    const files = e.target.files
    if (!files || files.length === 0) return
    const fileNames = Array.from(files).map((f) => f.name).join(', ')
    setTask((prev) => `${prev ? `${prev} ` : ''}[Attach file(s): ${fileNames}]`)
  }

  async function loadRecentTasks(): Promise<void> {
    try {
      const res = await window.app.recentTasks(6)
      if (res.ok && res.runs) {
        setRecentTasks(res.runs)
      }
    } catch {
      setRecentTasks([])
    }
  }

  function copyResponse(): void {
    if (!streamedResponse) return
    void navigator.clipboard.writeText(streamedResponse)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function parseTimeParts(time24: string): { ampm: 'AM' | 'PM'; hour12: string; minute: string } {
    const [hStr = '09', mStr = '00'] = time24.split(':')
    const h = parseInt(hStr, 10) || 9
    const ampm = h >= 12 ? 'PM' : 'AM'
    const h12 = h % 12 === 0 ? 12 : h % 12
    return {
      ampm,
      hour12: String(h12).padStart(2, '0'),
      minute: mStr.padStart(2, '0')
    }
  }

  function formatTimeDisplay(time24: string): string {
    const parts = parseTimeParts(time24)
    return `${parts.ampm} ${parseInt(parts.hour12, 10)}:${parts.minute}`
  }

  function updateTriggerTime(triggerId: string, current24: string, patch: Partial<{ ampm: 'AM' | 'PM'; hour12: string; minute: string }>): void {
    const cur = parseTimeParts(current24)
    const nextAmpm = patch.ampm ?? cur.ampm
    const nextHour12 = parseInt(patch.hour12 ?? cur.hour12, 10)
    const nextMin = patch.minute ?? cur.minute

    let h24 = nextHour12 % 12
    if (nextAmpm === 'PM') h24 += 12
    const next24 = `${String(h24).padStart(2, '0')}:${nextMin}`
    patchTrigger(setTriggers, triggerId, { time: next24 })
  }

  const hasEvent = triggers.some((t) => t.kind === 'event')
  const heading = mode === 'describe' ? 'Describe when the automation should run' : hasEvent || triggers.length === 0 ? 'When this happens' : 'When'

  const picker = pickerOpen && (
    <div className="picker-panel" role="menu" aria-label="Choose a trigger">
      <button type="button" className="picker-head" onClick={() => setPickerOpen(false)}>
        <span aria-hidden="true">‹</span> Gmail
      </button>
      {GMAIL_EVENTS.map((item) => (
        <button key={item.id} type="button" role="menuitem" className="picker-item" onClick={() => addEventTrigger(item.phrase)}>
          {item.label}
        </button>
      ))}
    </div>
  )

  return (
    <>
      <div className="builder-overlay" role="dialog" aria-modal="true" aria-label="Create automation">
        {/* Hidden file input for Local files */}
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          multiple
          onChange={handleFileSelected}
        />

        <form className="builder-card" onSubmit={(e) => void submit(e)}>
          {/* Header */}
          <div className="builder-when-head">
            <strong>{heading}</strong>
            <button type="button" aria-label="Close builder" onClick={props.onClose}>×</button>
          </div>

          {/* Working Animation Screen */}
          {working && (
            <div className="builder-working-container" role="status" aria-live="polite">
              <div className="builder-working-orb">
                <div className="builder-ring ring-1" />
                <div className="builder-ring ring-2" />
                <div className="builder-ring ring-3" />
                <div className="builder-core" />
              </div>
              <h3 className="builder-working-title">OpenCode ACP is working…</h3>
              <p className="builder-working-sub">
                Communicating with OpenCode agent harness and executing workflow steps
              </p>

              {activeToolEvents.length > 0 && (
                <div className="builder-tool-stream">
                  {activeToolEvents.slice(-3).map((toolName, idx) => (
                    <span key={idx} className="builder-tool-badge">
                      ⚡ {toolName}
                    </span>
                  ))}
                </div>
              )}

              {streamedResponse && (
                <div className="builder-stream-preview">
                  <pre>{streamedResponse}</pre>
                </div>
              )}

              <div className="builder-working-actions">
                <button type="button" className="builder-cancel-btn" onClick={handleCancelRun}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Done State Screen */}
          {!working && runDone && (
            <div className="builder-done-container">
              <div className="builder-done-header">
                <span className="builder-check-mark">✓</span>
                <div>
                  <h3>OpenCode ACP Response</h3>
                  <p>Workflow completed & schedule registered</p>
                </div>
              </div>

              <div className="builder-response-box">
                <pre>{streamedResponse || 'OpenCode completed the task successfully.'}</pre>
              </div>

              <div className="builder-done-footer">
                <button type="button" className="builder-btn-sec" onClick={copyResponse}>
                  {copied ? 'Copied!' : 'Copy Response'}
                </button>
                <button
                  type="button"
                  className="builder-btn-sec"
                  onClick={() => {
                    setRunDone(false)
                    setStreamedResponse('')
                  }}
                >
                  Edit & Run Again
                </button>
                <button type="button" className="builder-create" onClick={props.onClose}>
                  Done
                </button>
              </div>
            </div>
          )}

          {/* Default Form Screen (when not working and not done) */}
          {!working && !runDone && (
            <>
              {mode === 'describe' ? (
                <textarea
                  className="builder-task"
                  rows={6}
                  autoFocus
                  value={describe}
                  onChange={(e) => setDescribe(e.currentTarget.value)}
                  placeholder="e.g. Every weekday at 6:30pm summarize the latest AI news and send me the highlights"
                />
              ) : (
                <>
                  {/* Triggers: Schedule */}
                  {triggers.filter((t) => t.kind === 'schedule').map((trigger) => {
                    const timeParts = parseTimeParts(trigger.time)
                    const isRepeatOpen = openRepeatId === trigger.id
                    const isTimeOpen = openTimeId === trigger.id

                    const selectedRepeatLabel =
                      REPEAT_OPTIONS.find((r) => r.value === trigger.repeat)?.label ?? 'Daily'

                    return (
                      <div key={trigger.id} className="builder-trig when-card">
                        <span className="when-clock" aria-hidden="true"><ClockIcon /></span>

                        {/* Repeat Dropdown (file-ccc0f39bead9fe1e7132dc8bd0875624.png) */}
                        <div className="builder-menu-anchor">
                          <button
                            type="button"
                            className="pill-button"
                            aria-label="Repeat"
                            aria-expanded={isRepeatOpen}
                            onClick={() => {
                              setOpenRepeatId(isRepeatOpen ? null : trigger.id)
                              setOpenTimeId(null)
                            }}
                          >
                            <span>{selectedRepeatLabel}</span>
                            <span className="pill-chevron" aria-hidden="true">▾</span>
                          </button>

                          {isRepeatOpen && (
                            <div className="builder-repeat-popup" role="menu">
                              {REPEAT_OPTIONS.map((opt, idx) => {
                                const isSelected = opt.label.toLowerCase() === selectedRepeatLabel.toLowerCase()
                                return (
                                  <button
                                    key={idx}
                                    type="button"
                                    role="menuitem"
                                    className={`builder-repeat-item ${isSelected ? 'is-selected' : ''}`}
                                    onClick={() => {
                                      patchTrigger(setTriggers, trigger.id, { repeat: opt.value })
                                      setOpenRepeatId(null)
                                    }}
                                  >
                                    <span>{opt.label}</span>
                                    {isSelected && <span className="builder-repeat-check">✓</span>}
                                  </button>
                                )
                              })}
                            </div>
                          )}
                        </div>

                        <span className="builder-sched-note">at</span>

                        {/* 3-Column Time Picker (file-c68ed62ff5698b7323d382bd1e73042f.png) */}
                        <div className="builder-menu-anchor">
                          <button
                            type="button"
                            className="pill-button"
                            aria-label="Time"
                            aria-expanded={isTimeOpen}
                            onClick={() => {
                              setOpenTimeId(isTimeOpen ? null : trigger.id)
                              setOpenRepeatId(null)
                            }}
                          >
                            <span>{formatTimeDisplay(trigger.time)}</span>
                            <span className="pill-chevron" aria-hidden="true">▾</span>
                          </button>

                          {isTimeOpen && (
                            <div className="builder-time-popup" role="dialog" aria-label="Choose time">
                              <div className="builder-time-cols">
                                {/* Column 1: AM / PM */}
                                <div className="builder-time-col ampm-col">
                                  {(['AM', 'PM'] as const).map((ap) => (
                                    <button
                                      key={ap}
                                      type="button"
                                      className={`builder-time-option ${timeParts.ampm === ap ? 'is-selected' : ''}`}
                                      onClick={() => updateTriggerTime(trigger.id, trigger.time, { ampm: ap })}
                                    >
                                      {ap}
                                    </button>
                                  ))}
                                </div>

                                {/* Column 2: Hours (01 - 12) */}
                                <div className="builder-time-col">
                                  {HOURS_LIST.map((hr) => (
                                    <button
                                      key={hr}
                                      type="button"
                                      className={`builder-time-option ${timeParts.hour12 === hr ? 'is-selected' : ''}`}
                                      onClick={() => updateTriggerTime(trigger.id, trigger.time, { hour12: hr })}
                                    >
                                      {hr}
                                    </button>
                                  ))}
                                </div>

                                {/* Column 3: Minutes (00, 15, 30, 45) */}
                                <div className="builder-time-col">
                                  {MINUTES_LIST.map((mn) => (
                                    <button
                                      key={mn}
                                      type="button"
                                      className={`builder-time-option ${timeParts.minute === mn ? 'is-selected' : ''}`}
                                      onClick={() => {
                                        updateTriggerTime(trigger.id, trigger.time, { minute: mn })
                                        setOpenTimeId(null)
                                      }}
                                    >
                                      {mn}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        {triggers.length > 1 && (
                          <button
                            type="button"
                            className="builder-iconbtn"
                            aria-label="Remove schedule"
                            onClick={() => setTriggers((cur) => cur.filter((t) => t.id !== trigger.id))}
                          >
                            <TrashIcon />
                          </button>
                        )}
                      </div>
                    )
                  })}

                  {/* Triggers: Event */}
                  {triggers.filter((t) => t.kind === 'event').map((trigger, i) => (
                    <div key={trigger.id} className="builder-trig">
                      <div className="builder-trig-line">
                        <GmailMark />
                        <span className="builder-trig-text">When {trigger.event || 'something happens'} in mailbox</span>
                        <span className="builder-pill">{props.gmailConnected ? 'Connected' : 'Not Connected'} <span aria-hidden="true">▾</span></span>
                        <span className="builder-trig-text">of the account</span>
                        {!props.gmailConnected && (
                          <button type="button" className="builder-connect" onClick={props.onConnect}>Connect</button>
                        )}
                        <button
                          type="button"
                          className="builder-iconbtn"
                          aria-label={`Remove trigger ${i + 1}`}
                          onClick={() => setTriggers((cur) => cur.filter((t) => t.id !== trigger.id))}
                        >
                          <TrashIcon />
                        </button>
                      </div>
                      <div className="builder-trig-line indent">
                        <span className="builder-pill">{props.gmailConnected ? 'Connected' : 'Not Connected'} <span aria-hidden="true">▾</span></span>
                      </div>
                      <div className="builder-trig-line indent">
                        <span className="builder-cond" title="Conditions are not evaluated yet">+ Add conditions <span className="builder-q" aria-hidden="true">?</span></span>
                      </div>
                      <div className="builder-trig-line indent">
                        <span className="builder-sched-note">Check</span>
                        <select aria-label="Repeat" value={trigger.repeat} onChange={(e) => patchTrigger(setTriggers, trigger.id, { repeat: e.currentTarget.value as BuilderTrigger['repeat'] })}>
                          {REPEATS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                        <span className="builder-sched-note">at</span>
                        <select aria-label="Time" value={trigger.time} onChange={(e) => patchTrigger(setTriggers, trigger.id, { time: e.currentTarget.value })}>
                          {TIME_SLOTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                        </select>
                      </div>
                    </div>
                  ))}

                  {triggers.length === 0 && (
                    <button type="button" className="builder-addtrig" onClick={() => setPickerOpen((v) => !v)} aria-expanded={pickerOpen}>
                      + Add Trigger
                    </button>
                  )}
                  {picker}
                  {hasEvent && (
                    <button type="button" className="builder-addtrig" onClick={() => setPickerOpen((v) => !v)} aria-expanded={pickerOpen}>
                      + Add another trigger
                    </button>
                  )}

                  <p className="builder-will">What should it do</p>
                  <textarea
                    className="builder-task"
                    rows={4}
                    value={task}
                    onChange={(e) => setTask(e.currentTarget.value)}
                    placeholder="Describe what the automation should do, e.g. summarize the latest AI news and send me the highlights"
                  />
                </>
              )}

              {error && <p role="alert" className="automations-error">{error}</p>}

              {/* Footer */}
              <div className="builder-foot">
                <div className="builder-chips">
                  {/* Plus Sign Button (+) with Image 2 Menu */}
                  <div className="builder-addwrap">
                    <button
                      type="button"
                      className="builder-circle"
                      aria-label="Add connector or tool"
                      aria-expanded={addMenuOpen}
                      onClick={() => {
                        setAddMenuOpen((v) => !v)
                        setSkillsSubmenuOpen(false)
                        setRecentTasksSubmenuOpen(false)
                      }}
                    >
                      +
                    </button>

                    {/* Image 2 Context Menu */}
                    {addMenuOpen && (
                      <div className="builder-plus-menu" role="menu" aria-label="Insert options">
                        <button
                          type="button"
                          className="plus-menu-item"
                          onClick={handleLocalFilesClick}
                        >
                          <span className="plus-menu-icon">📎</span>
                          <span>Local files</span>
                        </button>

                        <button
                          type="button"
                          className="plus-menu-item"
                          onClick={() => {
                            setTask((prev) => `${prev ? `${prev} ` : ''}Create artifact with OpenCode`)
                            setAddMenuOpen(false)
                          }}
                        >
                          <span className="plus-menu-icon">✂️</span>
                          <span>Creations</span>
                          <span className="plus-menu-arrow">›</span>
                        </button>

                        <button
                          type="button"
                          className="plus-menu-item"
                          onClick={() => {
                            setTask((prev) => `${prev ? `${prev} ` : ''}Use prompt library routine`)
                            setAddMenuOpen(false)
                          }}
                        >
                          <span className="plus-menu-icon">📚</span>
                          <span>Library</span>
                          <span className="plus-menu-arrow">›</span>
                        </button>

                        <button
                          type="button"
                          className="plus-menu-item"
                          onClick={() => {
                            void loadRecentTasks()
                            setRecentTasksSubmenuOpen((v) => !v)
                            setSkillsSubmenuOpen(false)
                          }}
                        >
                          <span className="plus-menu-icon">🗂</span>
                          <span>Recent tasks</span>
                          <span className="plus-menu-arrow">›</span>
                        </button>

                        {/* Recent tasks submenu */}
                        {recentTasksSubmenuOpen && (
                          <div className="plus-submenu">
                            {recentTasks.length === 0 ? (
                              <div className="plus-submenu-empty">No recent tasks</div>
                            ) : (
                              recentTasks.map((t) => (
                                <button
                                  key={t.id}
                                  type="button"
                                  className="plus-submenu-item"
                                  onClick={() => {
                                    setTask((prev) => `${prev ? `${prev} ` : ''}${t.title}`)
                                    setAddMenuOpen(false)
                                    setRecentTasksSubmenuOpen(false)
                                  }}
                                >
                                  {t.title.slice(0, 36)}…
                                </button>
                              ))
                            )}
                          </div>
                        )}

                        <button
                          type="button"
                          className="plus-menu-item"
                          onClick={() => {
                            setSkillsSubmenuOpen((v) => !v)
                            setRecentTasksSubmenuOpen(false)
                          }}
                        >
                          <span className="plus-menu-icon">🧩</span>
                          <span>Use skills</span>
                          <span className="plus-menu-arrow">›</span>
                        </button>

                        {/* Skills submenu */}
                        {skillsSubmenuOpen && (
                          <div className="plus-submenu">
                            {TOOL_IDS.map((id: ActiveToolId) => (
                              <button
                                key={id}
                                type="button"
                                className="plus-submenu-item"
                                onClick={() => {
                                  toggleTool(id)
                                  setAddMenuOpen(false)
                                  setSkillsSubmenuOpen(false)
                                }}
                              >
                                {tools.includes(id) ? '✓ ' : ''}{TOOL_META[id].label}
                              </button>
                            ))}
                          </div>
                        )}

                        <div className="plus-menu-divider" />

                        <button
                          type="button"
                          className="plus-menu-item"
                          onClick={() => {
                            setTask((prev) => `${prev ? `${prev} ` : ''}[Google Drive: search files]`)
                            setAddMenuOpen(false)
                          }}
                        >
                          <span className="plus-menu-icon gdrive-icon">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                              <path d="M8.2 3.8L15.8 3.8L22 14.5L14.4 14.5L8.2 3.8Z" fill="#FFC107" />
                              <path d="M1.8 14.5L5.6 7.9L13.2 21.2L9.4 21.2L1.8 14.5Z" fill="#2684FC" />
                              <path d="M8.2 21.2L14.4 14.5L22 14.5L15.8 21.2L8.2 21.2Z" fill="#00AC47" />
                            </svg>
                          </span>
                          <span>Add from Google Drive files</span>
                        </button>

                        <button
                          type="button"
                          className="plus-menu-item"
                          onClick={() => {
                            setTask((prev) => `${prev ? `${prev} ` : ''}[OneDrive: search files]`)
                            setAddMenuOpen(false)
                          }}
                        >
                          <span className="plus-menu-icon onedrive-icon">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="#0078D4">
                              <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z" />
                            </svg>
                          </span>
                          <span>Add from OneDrive files</span>
                          <span className="plus-menu-arrow">›</span>
                        </button>

                        <button
                          type="button"
                          className="plus-menu-item"
                          onClick={() => {
                            setTask((prev) => `${prev ? `${prev} ` : ''}[Figma: inspect component]`)
                            setAddMenuOpen(false)
                          }}
                        >
                          <span className="plus-menu-icon figma-icon">
                            <svg width="16" height="16" viewBox="0 0 24 24">
                              <path d="M8 24C10.2 24 12 22.2 12 20V16H8C5.8 16 4 17.8 4 20C4 22.2 5.8 24 8 24Z" fill="#0ACF83" />
                              <path d="M4 12C4 9.8 5.8 8 8 8H12V16H8C5.8 16 4 14.2 4 12Z" fill="#A259FF" />
                              <path d="M4 4C4 1.8 5.8 0 8 0H12V8H8C5.8 8 4 6.2 4 4Z" fill="#F24E1E" />
                              <path d="M12 0H16C18.2 0 20 1.8 20 4C20 6.2 18.2 8 16 8H12V0Z" fill="#FF7262" />
                              <path d="M20 12C20 14.2 18.2 16 16 16C13.8 16 12 14.2 12 12C12 9.8 13.8 8 16 8C18.2 8 20 9.8 20 12Z" fill="#1ABCFE" />
                            </svg>
                          </span>
                          <span>Add from Figma</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Connectors Quick-Access Button with Anchored Popover Menu (Image 3 design) */}
                  <div className="builder-menu-anchor">
                    <button
                      type="button"
                      className="builder-connectors-trigger"
                      onClick={() => setConnectorMenuOpen((v) => !v)}
                      title="Open Connectors Menu"
                      aria-expanded={connectorMenuOpen}
                    >
                      <span>Connectors</span>
                      <span className="builder-conn-dot" />
                    </button>

                    <BuilderConnectorPopover
                      open={connectorMenuOpen}
                      onClose={() => setConnectorMenuOpen(false)}
                      onOpenSettings={() => {
                        setConnectorMenuOpen(false)
                        window.app.openSettingsWindow('connectors')
                      }}
                    />
                  </div>

                  {/* Connected Pills from Screenshot (file-f9683365af60c1bc1f1ffc9151b6c3d3.png) */}
                  <div className="builder-pill-badge" title="Desktop agent">
                    <span>Desktop Agent</span>
                  </div>

                  <div className="builder-pill-badge" title="QuickAuto Automations">
                    <span>Automations</span>
                  </div>

                  <button
                    type="button"
                    className="builder-pill-sliders"
                    aria-label="Settings configuration"
                    title="Connector options"
                    onClick={() => setConnectorMenuOpen((v) => !v)}
                  >
                    <span>⊸</span>
                  </button>

                  {/* Selected tool pills */}
                  {tools.map((id) => (
                    <span key={id} className="builder-pill">
                      @{id}
                      <button type="button" aria-label={`Remove @${id}`} className="builder-pill-x" onClick={() => setTools((cur) => cur.filter((t) => t !== id))}>×</button>
                    </span>
                  ))}
                </div>

                {/* Create Button */}
                <button
                  type="submit"
                  className="builder-create"
                  disabled={!compiled.valid || busy || working}
                  title={compiled.valid ? 'Send to OpenCode & create routine' : compiled.error}
                >
                  Create
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </>
  )
}
