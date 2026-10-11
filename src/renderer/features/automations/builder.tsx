import { useMemo, useState } from 'react'
import { TOOL_IDS, TOOL_META, type ActiveToolId } from '../../../shared/types.js'
import { GMAIL_EVENTS } from './trigger-events.js'
import { draftToText, makeTriggerId, type BuilderDraft, type BuilderRepeat, type BuilderTrigger } from './builder-compile.js'
import './automations.css'

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

/** Half-hour slots labeled like "AM 10:00" (screenshot spec), valued as 24h HH:MM. */
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
  const [addOpen, setAddOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const compiled = useMemo(
    () => draftToText(mode === 'describe'
      ? { mode, title: '', triggers: [], task: '', describe, tools: [] }
      : { mode: 'manual', title: props.initial.title, triggers, task, describe: '', tools }),
    [mode, props.initial.title, triggers, task, describe, tools]
  )

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    if (!compiled.valid || busy) return
    setBusy(true)
    setError('')
    try {
      const failure = await props.onSubmit(compiled.text)
      if (failure) setError(failure)
    } finally {
      setBusy(false)
    }
  }

  function toggleTool(id: ActiveToolId): void {
    setTools((cur) => (cur.includes(id) ? cur.filter((t) => t !== id) : [...cur, id]))
  }
  function addEventTrigger(phrase: string): void {
    setTriggers((cur) => [...cur, { id: makeTriggerId(), kind: 'event', repeat: 'daily', time: '09:00', app: 'gmail', event: phrase }])
    setPickerOpen(false)
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
    <div className="builder-overlay" role="dialog" aria-modal="true" aria-label="Create automation">
      <form className="builder-card" onSubmit={(e) => void submit(e)}>
        <div className="builder-when-head">
          <strong>{heading}</strong>
          <button type="button" aria-label="Close builder" onClick={props.onClose}>×</button>
        </div>

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
        {triggers.filter((t) => t.kind === 'schedule').map((trigger) => (
          <div key={trigger.id} className="builder-trig when-card">
            <span className="when-clock" aria-hidden="true"><ClockIcon /></span>
            <select
              className="pill-select"
              aria-label="Repeat"
              value={trigger.repeat}
              onChange={(e) => patchTrigger(setTriggers, trigger.id, { repeat: e.currentTarget.value as BuilderTrigger['repeat'] })}
            >
              {REPEATS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <span className="builder-sched-note">at</span>
            <select
              className="pill-select"
              aria-label="Time"
              value={trigger.time}
              onChange={(e) => patchTrigger(setTriggers, trigger.id, { time: e.currentTarget.value })}
            >
              {TIME_SLOTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
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
        ))}

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
              {/* ponytail: static until conditions are evaluated at run time */}
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
        <div className="builder-foot">
          <div className="builder-chips">
            <div className="builder-addwrap">
              <button type="button" className="builder-circle" aria-label="Add connector or tool" aria-expanded={addOpen} onClick={() => setAddOpen((v) => !v)}>+</button>
              {addOpen && (
                <div className="picker-panel builder-addmenu" role="menu" aria-label="Add connector or tool">
                  {TOOL_IDS.map((id: ActiveToolId) => (
                    <button key={id} type="button" role="menuitemcheckbox" aria-checked={tools.includes(id)} className="picker-item" onClick={() => toggleTool(id)}>
                      {tools.includes(id) ? '✓ ' : ''}{TOOL_META[id].label} — {TOOL_META[id].hint}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {tools.map((id) => (
              <span key={id} className="builder-pill">
                @{id}
                <button type="button" aria-label={`Remove @${id}`} className="builder-pill-x" onClick={() => setTools((cur) => cur.filter((t) => t !== id))}>×</button>
              </span>
            ))}
          </div>
          <button type="submit" className="builder-create" disabled={!compiled.valid || busy} title={compiled.valid ? 'Create automation' : compiled.error}>
            {busy ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  )
}
