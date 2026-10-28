import { ChevronDown, ChevronUp, Clock, Workflow, Zap } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Automation } from '../../../../shared/contracts/automations.js'
import type { RunRecord } from '../../../../shared/contracts/schedule.js'
import type { AgentProfile } from '../../../../main/agent/agent-store.js'
import { activeMention } from '../../../../shared/types.js'
import {
  getAvailableMentionTools,
  filterMentionTools,
  parsePromptMentionedTools,
  ToolPillIcon,
  type ConnectorStatusContext
} from '../../../shell/mentionTools.js'
import { AutomationActionsMenu } from './AutomationActionsMenu.js'
import { ConnectorPicker } from './ConnectorPicker.js'
import {
  WEEKDAY_LABELS,
  draftFrom,
  draftToPatch,
  isDirty,
  manageFilterOf,
  pad2,
  pickerTime,
  splitTriggerPrompt,
  timeOptions,
  validateDraft,
  type AutomationDraft
} from './scheduled.js'

const TIMES = timeOptions()

function SettingRow({ label, description, children }: {
  label: string
  description: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="st-row">
      <span className="st-row-text">
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <span className="st-row-control">{children}</span>
    </div>
  )
}

/** Detail / edit page for one Scheduled Task. */
export function AutomationDetail({ automation, focusSchedule = 0, onSaved, onToast, onOpenRun, onDirtyChange, onBack }: {
  automation: Automation
  focusSchedule?: number
  onSaved(next: Automation): void
  onToast(message: string): void
  onOpenRun(runId: string): void
  onDirtyChange(dirty: boolean): void
  onBack?(): void
}): React.JSX.Element {
  const [tab, setTab] = useState<'details' | 'history'>('details')
  const isTrigger = manageFilterOf(automation) === 'trigger'
  const triggerInfo = useMemo(() => splitTriggerPrompt(automation.prompt), [automation.prompt])

  const initialDraft = useMemo(() => {
    const d = draftFrom(automation)
    if (isTrigger && triggerInfo.triggerPhrase) {
      d.prompt = triggerInfo.task
    }
    return d
  }, [automation, isTrigger, triggerInfo])

  const [draft, setDraft] = useState<AutomationDraft>(() => initialDraft)
  const [baseline, setBaseline] = useState<AutomationDraft>(() => initialDraft)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [advancedOpen, setAdvancedOpen] = useState(true)
  const [agents, setAgents] = useState<AgentProfile[]>([])
  const [connectorIds, setConnectorIds] = useState<string[]>([])
  const [runs, setRuns] = useState<RunRecord[]>([])
  const scheduleRef = useRef<HTMLDivElement>(null)

  const [promptCaret, setPromptCaret] = useState(0)
  const [mentionDismissed, setMentionDismissed] = useState(false)
  const [selectedMentionIndex, setSelectedMentionIndex] = useState(0)
  const [mentionBox, setMentionBox] = useState<{ top: number; left: number; width: number } | null>(null)
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null)
  const [connectorState, setConnectorState] = useState<ConnectorStatusContext | null>(null)
  const [gmailConnected, setGmailConnected] = useState(false)

  useEffect(() => {
    setDraft(initialDraft)
    setBaseline(initialDraft)
  }, [initialDraft])

  useEffect(() => {
    let live = true
    void window.app.agentsList()
      .then((res) => { if (live && res.ok && res.agents) setAgents(res.agents) })
      .catch(() => {})
    void window.app.getConnector()
      .then((res) => {
        if (!live) return
        setConnectorState(res as ConnectorStatusContext)
        setConnectorIds((res.services ?? []).filter((service) => service.connected).map((service) => service.id))
      })
      .catch(() => {})
    void window.app.connectionStatus('gmail')
      .then((res) => {
        if (!live) return
        if (res && res.ok) setGmailConnected(Boolean(res.connected))
      })
      .catch(() => {})
    return () => { live = false }
  }, [])

  const availableTools = useMemo(() => {
    return getAvailableMentionTools({
      configured: connectorState?.configured,
      services: connectorState?.services,
      connectedSlugs: connectorState?.connectedSlugs,
      gmailConnected
    })
  }, [connectorState, gmailConnected])

  const promptMention = mentionDismissed ? null : activeMention(draft.prompt, promptCaret)
  const suggestions = useMemo(
    () => (promptMention ? filterMentionTools(availableTools, promptMention.typed) : []),
    [promptMention?.start, promptMention?.typed, availableTools]
  )

  useEffect(() => {
    setSelectedMentionIndex(0)
  }, [suggestions.length, promptMention?.typed])

  useEffect(() => {
    if (!promptMention) {
      setMentionBox(null)
      return
    }
    const updatePosition = (): void => {
      const rect = promptTextareaRef.current?.getBoundingClientRect()
      if (!rect) return
      const spaceBelow = window.innerHeight - rect.bottom
      const top = spaceBelow > 220 ? rect.bottom + 6 : Math.max(10, rect.top - 230)
      setMentionBox({ top, left: rect.left, width: rect.width })
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [promptMention])

  function insertMention(id: string): void {
    if (!promptMention) return
    const replacement = `@${id} `
    const next = `${draft.prompt.slice(0, promptMention.start)}${replacement}${draft.prompt.slice(promptCaret)}`
    const nextCaret = promptMention.start + replacement.length
    patch({ prompt: next })
    setPromptCaret(nextCaret)
    setMentionDismissed(false)
    requestAnimationFrame(() => {
      promptTextareaRef.current?.focus()
      promptTextareaRef.current?.setSelectionRange(nextCaret, nextCaret)
    })
  }

  function removeMention(id: string): void {
    const re = new RegExp(`@${id}\\b\\s*`, 'gi')
    const next = draft.prompt.replace(re, '')
    patch({ prompt: next })
    setPromptCaret(Math.min(promptCaret, next.length))
    promptTextareaRef.current?.focus()
  }

  function handlePromptKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
    if (promptMention && suggestions.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSelectedMentionIndex((prev) => (prev + 1) % suggestions.length)
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setSelectedMentionIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length)
        return
      }
      if ((event.key === 'Enter' || event.key === 'Tab') && !event.shiftKey) {
        event.preventDefault()
        const target = suggestions[selectedMentionIndex] ?? suggestions[0]
        if (target) insertMention(target.id)
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setMentionDismissed(true)
        return
      }
    }
  }

  const activePromptTools = useMemo(
    () => parsePromptMentionedTools(draft.prompt, availableTools),
    [draft.prompt, availableTools]
  )

  useEffect(() => {
    let live = true
    void window.app.automationsRuns(automation.id)
      .then((res) => { if (live && res.ok && res.runs) setRuns(res.runs) })
      .catch(() => {})
    return () => { live = false }
  }, [automation.id, tab])

  useEffect(() => {
    if (!focusSchedule) return
    setTab('details')
    scheduleRef.current?.focus()
    scheduleRef.current?.scrollIntoView({ block: 'center' })
  }, [focusSchedule])

  const dirty = useMemo(() => isDirty(draft, baseline), [draft, baseline])

  useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty, onDirtyChange])

  // Warn before the window closes with unsaved edits.
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  function patch(next: Partial<AutomationDraft>): void {
    setDraft((current) => ({ ...current, ...next }))
  }

  function toggleWeekday(day: number): void {
    patch({
      weekdays: draft.weekdays.includes(day)
        ? draft.weekdays.filter((item) => item !== day)
        : [...draft.weekdays, day]
    })
  }

  /** Switching frequency keeps the row valid: a date for "once", a day for "weekly". */
  function setFrequency(type: AutomationDraft['scheduleType']): void {
    if (type === 'weekly' && draft.weekdays.length === 0) {
      patch({ scheduleType: type, weekdays: [new Date().getDay()] })
      return
    }
    if (type === 'once' && !draft.date) {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      patch({ scheduleType: type, date: `${tomorrow.getFullYear()}-${pad2(tomorrow.getMonth() + 1)}-${pad2(tomorrow.getDate())}` })
      return
    }
    patch({ scheduleType: type })
  }

  async function save(): Promise<void> {
    const fullPrompt = [draft.prompt.trim(), triggerInfo.triggerPhrase].filter(Boolean).join('. ')
    const toValidate = { ...draft, prompt: fullPrompt }
    const message = validateDraft(toValidate, automation.kind)
    if (message) {
      setError(message)
      return
    }
    setSaving(true)
    setError('')
    try {
      const res = await window.app.automationsUpdate(automation.id, draftToPatch(toValidate, automation.kind))
      if (!res.ok || !res.automation) {
        setError(res.error ?? 'Could not save the automation.')
        return
      }
      setBaseline(draft)
      onSaved(res.automation)
      onToast('Automation saved.')
    } finally {
      setSaving(false)
    }
  }

  const icon = automation.kind === 'advanced' ? <Workflow size={22} /> : isTrigger ? <Zap size={22} /> : <Clock size={22} />
  const kindLabel = automation.kind === 'advanced' ? 'Advanced' : isTrigger ? 'Trigger' : 'Schedule'

  return (
    <section className="st-detail" aria-label={`${automation.title} details`}>
      {onBack && (
        <div className="st-detail-nav">
          <button type="button" className="st-back" onClick={onBack} aria-label="Back to automations">
            ← Back to automations
          </button>
        </div>
      )}

      <header className="st-detail-head">
        <span className="st-icon-tile is-small" aria-hidden="true">{icon}</span>
        <div className="st-detail-headings">
          <p className="st-detail-kind">{kindLabel}</p>
          <h2 className="st-detail-title">{automation.title}</h2>
        </div>
        <div className="st-detail-actions">
          <span className={`st-pill is-${automation.status}`}>
            <span className="st-dot" aria-hidden="true" />
            {automation.status === 'active' ? 'Active' : 'Paused'}
          </span>
          <AutomationActionsMenu automation={automation} />
        </div>
      </header>

      {isTrigger && triggerInfo.triggerPhrase && (
        <div className="st-trigger-banner" role="status" aria-label="Trigger event">
          <span className="st-trigger-badge">Trigger</span>
          <div className="st-trigger-desc">
            <strong>When {triggerInfo.event || triggerInfo.triggerPhrase}</strong>
            {triggerInfo.app && <small>Monitored via @{triggerInfo.app} · Evaluated according to schedule</small>}
          </div>
        </div>
      )}

      <div className="st-tabs" role="tablist" aria-label={`${automation.title} sections`}>
        <button type="button" role="tab" aria-selected={tab === 'details'} onClick={() => setTab('details')}>Details</button>
        <button type="button" role="tab" aria-selected={tab === 'history'} onClick={() => setTab('history')}>History</button>
      </div>

      {tab === 'details' ? (
        <form className="st-form" onSubmit={(event) => { event.preventDefault(); void save() }}>
          <div className="st-field">
            <label htmlFor="st-title">Title</label>
            <input
              id="st-title"
              className="st-input"
              value={draft.title}
              onChange={(event) => patch({ title: event.target.value })}
            />
          </div>

          <div className="st-field">
            <label htmlFor="st-frequency" id="st-schedule-label">Schedule</label>
            <div className="st-schedule" role="group" aria-labelledby="st-schedule-label" ref={scheduleRef} tabIndex={-1}>
              <Clock size={18} aria-hidden="true" />
              <select
                id="st-frequency"
                className="st-select"
                aria-label="Frequency"
                value={draft.scheduleType}
                onChange={(event) => setFrequency(event.target.value as AutomationDraft['scheduleType'])}
              >
                <option value="once">Once</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
              <span className="st-at">at</span>
              <select
                className="st-select"
                aria-label="Time"
                value={draft.time}
                onChange={(event) => patch({ time: event.target.value })}
              >
                {TIMES.map((time) => (
                  <option key={time} value={time}>{pickerTime(time)}</option>
                ))}
              </select>
              {draft.scheduleType === 'once' && (
                <input
                  type="date"
                  className="st-input st-date"
                  aria-label="Date"
                  value={draft.date}
                  onChange={(event) => patch({ date: event.target.value })}
                />
              )}
              {draft.scheduleType === 'weekly' && (
                <div className="st-weekdays" role="group" aria-label="Days of the week">
                  {WEEKDAY_LABELS.map((label, day) => (
                    <button
                      key={label}
                      type="button"
                      aria-pressed={draft.weekdays.includes(day)}
                      onClick={() => toggleWeekday(day)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="st-field">
            <label htmlFor="st-prompt">Task description</label>
            {activePromptTools.length > 0 && (
              <div className="chat-composer-pills-row" aria-label="Mentioned tools">
                {activePromptTools.map((tool) => (
                  <span key={tool.id} className="chat-tool-pill-modern" title={tool.hint}>
                    <ToolPillIcon tool={tool} />
                    <span className="chat-tool-pill-label">{tool.label}</span>
                    <button
                      type="button"
                      className="chat-tool-pill-remove"
                      aria-label={`Remove ${tool.label}`}
                      onClick={() => removeMention(tool.id)}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
            <textarea
              id="st-prompt"
              ref={promptTextareaRef}
              className="st-textarea"
              value={draft.prompt}
              onChange={(event) => {
                patch({ prompt: event.target.value })
                setPromptCaret(event.target.selectionStart)
                setMentionDismissed(false)
              }}
              onClick={(event) => {
                setPromptCaret(event.currentTarget.selectionStart)
                setMentionDismissed(false)
              }}
              onKeyUp={(event) => {
                setPromptCaret(event.currentTarget.selectionStart)
              }}
              onKeyDown={handlePromptKeyDown}
              placeholder="Describe what Palette should do, e.g. summarize messages or search the web"
            />
            {promptMention && mentionBox && createPortal(
              <div
                className="chat-mention-menu"
                role="listbox"
                aria-label="Available tools"
                style={{
                  position: 'fixed',
                  top: `${mentionBox.top}px`,
                  left: `${mentionBox.left}px`,
                  width: `${mentionBox.width}px`,
                  zIndex: 10000
                }}
              >
                {suggestions.map((tool, index) => (
                  <button
                    key={tool.id}
                    type="button"
                    role="option"
                    aria-selected={index === selectedMentionIndex}
                    className={`chat-mention-option ${index === selectedMentionIndex ? 'is-selected' : ''}`}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => insertMention(tool.id)}
                  >
                    <ToolPillIcon tool={tool} />
                    <div className="chat-mention-option-info">
                      <div className="chat-mention-option-header">
                        <span className="chat-mention-option-name">{tool.label}</span>
                        <span className="chat-mention-option-id">@{tool.id}</span>
                        <span className={`chat-mention-badge is-${tool.kind}`}>
                          {tool.kind === 'builtin' ? 'In-built' : tool.kind === 'skill' ? 'Skill' : 'Connected'}
                        </span>
                      </div>
                      <span className="chat-mention-option-hint">{tool.hint}</span>
                    </div>
                  </button>
                ))}
                {suggestions.length === 0 && (
                  <div className="chat-mention-empty">
                    No connected tools match &quot;{promptMention.typed}&quot;
                  </div>
                )}
              </div>,
              document.body
            )}
          </div>

          <section className="st-panel is-collapsible">
            <button
              type="button"
              className="st-panel-head"
              aria-expanded={advancedOpen}
              onClick={() => setAdvancedOpen((value) => !value)}
            >
              <span className="st-panel-text">
                <strong>Advanced settings</strong>
                <small>Run options, agent, connectors and expiration date.</small>
              </span>
              {advancedOpen ? <ChevronUp size={18} aria-hidden="true" /> : <ChevronDown size={18} aria-hidden="true" />}
            </button>
            {advancedOpen && (
              <div className="st-rows">
                <SettingRow label="Run options" description="Choose whether each run starts in the same task or a separate task.">
                  <select
                    className="st-select"
                    aria-label="Run options"
                    value={draft.runMode}
                    onChange={(event) => patch({ runMode: event.target.value as AutomationDraft['runMode'] })}
                  >
                    <option value="separate_task">Separate task</option>
                    <option value="same_task">Same task</option>
                  </select>
                </SettingRow>
                <SettingRow label="Agent" description="Choose your preferred agent to run the task.">
                  <select
                    className="st-select"
                    aria-label="Agent"
                    value={draft.agent}
                    onChange={(event) => patch({ agent: event.target.value })}
                  >
                    <option value="">None</option>
                    {agents.map((agent) => (
                      <option key={agent.id} value={agent.id}>{agent.name}</option>
                    ))}
                  </select>
                </SettingRow>
                <SettingRow label="Connectors" description="Use connected apps to enrich this task with relevant data.">
                  <ConnectorPicker
                    options={connectorIds}
                    selected={draft.connectors}
                    onChange={(next) => patch({ connectors: next })}
                  />
                </SettingRow>
                <SettingRow label="Expiration date" description="Choose when this automation stops running.">
                  <input
                    type="date"
                    className="st-input st-date"
                    aria-label="Expiration date"
                    value={draft.expiresAt}
                    onChange={(event) => patch({ expiresAt: event.target.value })}
                  />
                </SettingRow>
              </div>
            )}
          </section>

          {error && <p className="st-error" role="alert">{error}</p>}

          <footer className="st-actions">
            <button type="submit" className="st-save" disabled={!dirty || saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </footer>
        </form>
      ) : (
        <div className="st-history">
          {runs.length === 0 && <p className="st-empty-note">No runs yet.</p>}
          {runs.map((run) => (
            <button
              key={run.id}
              type="button"
              className="st-history-row"
              onClick={() => onOpenRun(run.id)}
            >
              <span className={`st-dot is-${run.status}`} aria-hidden="true" />
              <span className="st-history-text">
                <strong>{new Date(run.endedAt ?? run.startedAt).toLocaleString()}</strong>
                <small>{run.status.replaceAll('_', ' ')}</small>
              </span>
              <span className="st-history-link">View run</span>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
