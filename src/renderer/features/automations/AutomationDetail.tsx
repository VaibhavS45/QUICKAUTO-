import { ChevronDown, ChevronUp, Clock, Workflow } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Automation } from '../../../shared/contracts/automations.js'
import type { RunRecord } from '../../../shared/contracts/schedule.js'
import type { AgentProfile } from '../../../main/agent/agent-store.js'
import { AutomationActionsMenu } from './AutomationActionsMenu.js'
import { ConnectorPicker } from './ConnectorPicker.js'
import {
  WEEKDAY_LABELS,
  draftFrom,
  draftToPatch,
  isDirty,
  pad2,
  pickerTime,
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
export function AutomationDetail({ automation, focusSchedule = 0, onSaved, onToast, onOpenRun, onDirtyChange }: {
  automation: Automation
  focusSchedule?: number
  onSaved(next: Automation): void
  onToast(message: string): void
  onOpenRun(runId: string): void
  onDirtyChange(dirty: boolean): void
}): React.JSX.Element {
  const [tab, setTab] = useState<'details' | 'history'>('details')
  const [draft, setDraft] = useState<AutomationDraft>(() => draftFrom(automation))
  const [baseline, setBaseline] = useState<AutomationDraft>(() => draftFrom(automation))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [advancedOpen, setAdvancedOpen] = useState(true)
  const [agents, setAgents] = useState<AgentProfile[]>([])
  const [connectorIds, setConnectorIds] = useState<string[]>([])
  const [runs, setRuns] = useState<RunRecord[]>([])
  const scheduleRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setDraft(draftFrom(automation))
    setBaseline(draftFrom(automation))
  }, [automation.id])

  useEffect(() => {
    let live = true
    void window.app.agentsList()
      .then((res) => { if (live && res.ok && res.agents) setAgents(res.agents) })
      .catch(() => {})
    void window.app.getConnector()
      .then((res) => {
        if (!live) return
        setConnectorIds((res.services ?? []).filter((service) => service.connected).map((service) => service.id))
      })
      .catch(() => {})
    return () => { live = false }
  }, [])

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
    const message = validateDraft(draft, automation.kind)
    if (message) {
      setError(message)
      return
    }
    setSaving(true)
    setError('')
    const saved = draft
    try {
      const res = await window.app.automationsUpdate(automation.id, draftToPatch(saved, automation.kind))
      if (!res.ok || !res.automation) {
        setError(res.error ?? 'Could not save the automation.')
        return
      }
      setBaseline(draftFrom(res.automation))
      onSaved(res.automation)
      onToast('Automation saved.')
    } finally {
      setSaving(false)
    }
  }

  const icon = automation.kind === 'advanced' ? <Workflow size={22} /> : <Clock size={22} />

  return (
    <section className="st-detail" aria-label={`${automation.title} details`}>
      <header className="st-detail-head">
        <span className="st-icon-tile is-small" aria-hidden="true">{icon}</span>
        <div className="st-detail-headings">
          <p className="st-detail-kind">{automation.kind === 'advanced' ? 'Advanced' : 'Schedule'}</p>
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
            <label htmlFor="st-prompt">Prompt</label>
            <textarea
              id="st-prompt"
              className="st-textarea"
              value={draft.prompt}
              onChange={(event) => patch({ prompt: event.target.value })}
            />
          </div>

          <section className="st-panel">
            <div className="st-panel-text">
              <strong>Confirmations</strong>
              <small>Scheduled runs are read-only: sending, writing, deleting and pushing are always blocked.</small>
            </div>
          </section>

          <section className="st-panel is-collapsible">
            <button
              type="button"
              className="st-panel-head"
              aria-expanded={advancedOpen}
              onClick={() => setAdvancedOpen((value) => !value)}
            >
              <span className="st-panel-text">
                <strong>Advanced settings</strong>
                <small>Manage run options, agent type, connectors, project, cloud computer, local folder, or expiration date.</small>
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
                <SettingRow label="Project" description="Run this scheduled task within a project to use its configurations.">
                  <select className="st-select" aria-label="Project" disabled defaultValue="">
                    <option value="">None</option>
                  </select>
                </SettingRow>
                <SettingRow label="Local folder" description="Run this task in a folder shared from the desktop app.">
                  <select className="st-select" aria-label="Local folder" disabled defaultValue="">
                    <option value="">None</option>
                  </select>
                </SettingRow>
                <SettingRow label="Cloud computer" description="Leverage cloud computing to augment task-relevant data.">
                  <select className="st-select" aria-label="Cloud computer" disabled defaultValue="">
                    <option value="">None</option>
                  </select>
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
