import { useMemo, useState } from 'react'
import { blankTrigger, draftToText, type BuilderDraft } from './builder-compile.js'
import './automations.css'

interface BuilderProps {
  initial: BuilderDraft
  gmailConnected: boolean | undefined
  onConnect(): void
  onClose(): void
  /** Resolves with an error message, or null on success. */
  onSubmit(text: string): Promise<string | null>
}

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

function LaptopIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <rect x="2.5" y="3" width="9" height="6.5" rx="1" />
      <path d="M1.5 12h11l-1.2-2H3.7L2.5 12Z" strokeLinejoin="round" />
    </svg>
  )
}

function AutomationsIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <rect x="1.5" y="1.5" width="5" height="5" rx="1.2" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="1.2" />
      <path d="M6.5 4H11a1 1 0 0 1 1 1v4.5M9.5 12H5a1 1 0 0 1-1-1V6.5" />
    </svg>
  )
}

function SlidersIcon(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <path d="M2 5h12M2 11h12" strokeLinecap="round" />
      <circle cx="6" cy="5" r="1.8" fill="#1b1b1e" />
      <circle cx="10.5" cy="11" r="1.8" fill="#1b1b1e" />
    </svg>
  )
}

export default function Builder(props: BuilderProps): React.JSX.Element {
  const [triggers, setTriggers] = useState(props.initial.triggers)
  const [task, setTask] = useState(props.initial.task)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const compiled = useMemo(() => draftToText({ mode: 'manual', title: props.initial.title, triggers, task, describe: '' }), [props.initial.title, triggers, task])

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

  return (
    <div className="builder-overlay" role="dialog" aria-modal="true" aria-label="Create automation" onPointerDown={(e) => { if (e.target === e.currentTarget) props.onClose() }}>
      <form className="builder-card" onSubmit={(e) => void submit(e)}>
        <div className="builder-when-head">
          <strong>When this happens</strong>
          <button type="button" aria-label="Close builder" onClick={props.onClose}>×</button>
        </div>

        {triggers.map((trigger, i) => (
          <div key={trigger.id} className="builder-trig">
            {trigger.kind === 'event' ? (
              <>
                <div className="builder-trig-line">
                  <GmailMark />
                  <span className="builder-trig-text">When a new conversation is started in mailbox</span>
                  <span className="builder-pill">{props.gmailConnected ? 'Connected' : 'Not Connected'} <span aria-hidden="true">▾</span></span>
                  <span className="builder-trig-text">of the account</span>
                  {!props.gmailConnected && (
                    <button type="button" className="builder-connect" onClick={props.onConnect}>Connect</button>
                  )}
                  <button
                    type="button"
                    className="builder-iconbtn"
                    aria-label={`Remove trigger ${i + 1}`}
                    disabled={triggers.length <= 1}
                    onClick={() => setTriggers((cur) => cur.filter((t) => t.id !== trigger.id))}
                  >
                    <TrashIcon />
                  </button>
                </div>
                <div className="builder-trig-line indent">
                  <input
                    className="builder-pill-input"
                    aria-label="Mailbox"
                    placeholder="Not Connected"
                    value={trigger.event}
                    onChange={(e) => setTriggers((cur) => cur.map((t) => (t.id === trigger.id ? { ...t, event: e.currentTarget.value } : t)))}
                  />
                </div>
                <div className="builder-trig-line indent">
                  {/* ponytail: static until conditions are evaluated at run time */}
                  <span className="builder-cond" title="Conditions are not evaluated yet">+ Add conditions <span className="builder-q" aria-hidden="true">?</span></span>
                </div>
                <div className="builder-trig-line indent">
                  <span className="builder-sched-note">Check</span>
                  <select aria-label="Repeat" value={trigger.repeat} onChange={(e) => setTriggers((cur) => cur.map((t) => (t.id === trigger.id ? { ...t, repeat: e.currentTarget.value as typeof trigger.repeat } : t)))}>
                    <option value="once">Once</option>
                    <option value="daily">Daily</option>
                    <option value="weekdays">Weekdays</option>
                  </select>
                  <span className="builder-sched-note">at</span>
                  <input type="time" aria-label="Time" value={trigger.time} onChange={(e) => setTriggers((cur) => cur.map((t) => (t.id === trigger.id ? { ...t, time: e.currentTarget.value } : t)))} />
                </div>
              </>
            ) : (
              <div className="builder-trig-line">
                <span className="builder-trig-text">When</span>
                <select aria-label="Repeat" value={trigger.repeat} onChange={(e) => setTriggers((cur) => cur.map((t) => (t.id === trigger.id ? { ...t, repeat: e.currentTarget.value as typeof trigger.repeat } : t)))}>
                  <option value="once">Once</option>
                  <option value="daily">Daily</option>
                  <option value="weekdays">Weekdays</option>
                </select>
                <span className="builder-sched-note">at</span>
                <input type="time" aria-label="Time" value={trigger.time} onChange={(e) => setTriggers((cur) => cur.map((t) => (t.id === trigger.id ? { ...t, time: e.currentTarget.value } : t)))} />
                <button
                  type="button"
                  className="builder-iconbtn"
                  aria-label={`Remove trigger ${i + 1}`}
                  disabled={triggers.length <= 1}
                  onClick={() => setTriggers((cur) => cur.filter((t) => t.id !== trigger.id))}
                >
                  <TrashIcon />
                </button>
              </div>
            )}
          </div>
        ))}

        <button type="button" className="builder-addtrig" onClick={() => setTriggers((cur) => [...cur, blankTrigger('event')])}>
          + Add another trigger
        </button>

        <p className="builder-will">Manus will</p>
        <textarea
          className="builder-task"
          rows={4}
          value={task}
          onChange={(e) => setTask(e.currentTarget.value)}
          placeholder="Describe what Manus should do, e.g. summarize the latest AI news and send me the highlights"
        />

        {error && <p role="alert" className="automations-error">{error}</p>}
        <div className="builder-foot">
          <div className="builder-chips">
            {/* ponytail: static chips until the run-target picker lands */}
            <button type="button" className="builder-circle" title="More options (later)">+</button>
            <button type="button" className="builder-chip" title="Run target (later)"><LaptopIcon /> Manus Desktop</button>
            <button type="button" className="builder-chip is-on" title="Run target (later)"><AutomationsIcon /> Automations</button>
            <button type="button" className="builder-circle" title="Run options (later)"><SlidersIcon /></button>
          </div>
          <button type="submit" className="builder-create" disabled={!compiled.valid || busy} title={compiled.valid ? 'Create automation' : compiled.error}>
            {busy ? 'Creating…' : 'Create'}
          </button>
        </div>
      </form>
    </div>
  )
}
