import { useEffect, useMemo, useState } from 'react'
import type { ShellApi } from '../contracts/feature.js'
import type { RunRecord } from '../../shared/contracts/schedule.js'
import { routineTitle, timeLabel } from '../features/automations/dates.js'

const SEEN_KEY = 'palette:updates-since'

export interface StreamRow {
  key: string
  title: string
  body: string
  at: number
  status: string
}

/** Display rows for runs (pure, unit-tested). */
export function updateStreamRows(runs: Pick<RunRecord, 'id' | 'title' | 'summary' | 'startedAt' | 'endedAt' | 'status'>[]): StreamRow[] {
  return runs.map((run) => ({
    key: run.id,
    title: routineTitle(run.title),
    body: (run.summary ?? '').trim().split('\n')[0] ?? '',
    at: run.endedAt ?? run.startedAt,
    status: run.status
  }))
}

/** Only runs newer than the last-close marker (pure, unit-tested). */
export function filterNewRuns(rows: StreamRow[], sinceAt: number): StreamRow[] {
  return rows.filter((row) => row.at > sinceAt)
}

function readSeenAt(): number {
  if (typeof window === 'undefined') return 0
  const raw = window.localStorage.getItem(SEEN_KEY)
  const value = raw === null ? NaN : Number(raw)
  return Number.isFinite(value) ? value : 0
}

/** New-since-last-close update boxes; click one to open its info in Automations. */
export function UpdatesStream({ shell }: { shell: ShellApi }): React.JSX.Element {
  const [runs, setRuns] = useState<RunRecord[]>([])
  const [failed, setFailed] = useState(false)
  const [seenAt] = useState(readSeenAt)
  const rows = useMemo(() => filterNewRuns(updateStreamRows(runs), seenAt), [runs, seenAt])

  useEffect(() => {
    let active = true
    window.app.recentTasks(20)
      .then((result) => {
        if (!active) return
        if (result.ok && result.runs) setRuns(result.runs)
        else setFailed(true)
      })
      .catch(() => {
        if (active) setFailed(true)
      })
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const markClosed = (): void => {
      window.localStorage.setItem(SEEN_KEY, String(Date.now()))
    }
    window.addEventListener('pagehide', markClosed)
    window.addEventListener('beforeunload', markClosed)
    return () => {
      window.removeEventListener('pagehide', markClosed)
      window.removeEventListener('beforeunload', markClosed)
    }
  }, [])

  function openRow(row: StreamRow): void {
    shell.navigate('automations', { focusRunId: row.key })
  }

  if (failed) return <p className="automations-empty">Could not load updates.</p>
  if (!runs.length) {
    return <p className="automations-empty">No updates yet. Run an automation to see results here.</p>
  }
  if (!rows.length) return <p className="automations-empty">You’re all caught up.</p>

  return (
    <div className="updates-stream-list" aria-label="Recent automation updates">
      {rows.map((row) => (
        <button
          key={row.key}
          type="button"
          className="updates-stream-box updates-stream-card"
          onClick={() => openRow(row)}
          aria-label={`${row.title}, ${row.status.replaceAll('_', ' ')}`}
        >
          <div className="updates-card-left">
            <span className="updates-card-icon" aria-hidden="true">⟁</span>
            <strong className="updates-card-title">{row.title}</strong>
            <small className="updates-card-time">{timeLabel(row.at)}</small>
          </div>
          <div className="updates-card-body">
            <span>{row.body || 'No output recorded yet.'}</span>
          </div>
        </button>
      ))}
    </div>
  )
}
