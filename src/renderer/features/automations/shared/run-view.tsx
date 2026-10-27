import { useState } from 'react'
import { Check, Clock, Copy, MessageSquare, Workflow } from 'lucide-react'
import type { RunRecord } from '../../../../shared/contracts/schedule.js'
import { formatDate, formatTime } from '../../../lib/format.js'
import { RunMarkdown } from './RunMarkdown.js'
import { formatDuration, statusLabel, statusTone } from './run-format.js'
import { routineTitle } from './dates.js'
import './run-view.css'

/** Title, one status chip, and a quiet meta line. Replaces the old kicker/status/badge stack. */
export function RunHeader({ run }: { run: RunRecord }): React.JSX.Element {
  const tone = statusTone(run.status)
  const duration = formatDuration(run.startedAt, run.endedAt)
  return (
    <header className="rv-header">
      <p className="rv-kicker">Run output</p>
      <h2 className="rv-title">{routineTitle(run.title)}</h2>
      <div className="rv-meta">
        <span className={`rv-chip is-${tone}`}>
          {tone === 'ok' && <Check size={12} aria-hidden="true" />}
          {statusLabel(run.status)}
        </span>
        <span className="rv-meta-item">
          <Clock size={13} aria-hidden="true" />
          {formatDate(run.startedAt)} · {formatTime(run.startedAt)}
        </span>
        {duration && <span className="rv-meta-item">Took {duration}</span>}
        {run.chatId && (
          <span className="rv-meta-item"><MessageSquare size={13} aria-hidden="true" />From chat</span>
        )}
        {!run.chatId && run.routineId && (
          <span className="rv-meta-item"><Workflow size={13} aria-hidden="true" />Automation</span>
        )}
      </div>
    </header>
  )
}

/** Output card: formatted text with copyable code blocks, or a calm empty state. */
export function RunOutput({ text }: { text: string }): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  const output = text.trim()
  const copy = (): void => {
    void navigator.clipboard?.writeText(output).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    }).catch(() => {})
  }
  return (
    <section className="rv-card" aria-label="Output">
      <div className="rv-card-head">
        <h3 className="rv-kicker">Output</h3>
        <button type="button" className="rv-copy" onClick={copy} disabled={!output}>
          {copied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
          {copied ? 'Copied' : 'Copy all'}
        </button>
      </div>
      <div className="rv-card-body">
        {output ? (
          <RunMarkdown text={output} />
        ) : (
          <p className="rv-empty">No output recorded yet. This run finished without returning any text.</p>
        )}
      </div>
    </section>
  )
}
