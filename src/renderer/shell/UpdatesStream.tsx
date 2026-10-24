import { useEffect, useMemo, useState } from 'react'
import type { ShellApi } from '../contracts/feature.js'
import type { RunRecord } from '../../shared/contracts/schedule.js'
import { localDayKey, pastDayLabel, routineTitle, timeLabel } from '../features/automations/dates.js'
import { UpdatesGlyph } from '../components/ui/primitives.js'

const SEEN_KEY = 'palette:updates-since'
const PREVIEW_MAX_ROWS = 4

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

/** Group rows by local day, newest day first (pure, unit-tested). */
export function groupStreamRows(rows: StreamRow[]): { key: string; rows: StreamRow[] }[] {
  const byDay = new Map<string, StreamRow[]>()
  for (const row of rows) {
    const key = localDayKey(new Date(row.at))
    const list = byDay.get(key) ?? []
    list.push(row)
    byDay.set(key, list)
  }
  return [...byDay.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, dayRows]) => ({ key, rows: dayRows }))
}

/**
 * Loads the recent-run stream and keeps it live (W6): reloads whenever
 * updates change so a session-long view sees new runs without a remount.
 * Returns the cleanup that unsubscribes and freezes further loads.
 */
export function watchStreamRuns(
  load: (n: number) => Promise<{ ok: boolean; runs?: RunRecord[] }>,
  onUpdatesChanged: (cb: () => void) => () => void,
  setState: (runs: RunRecord[], failed: boolean) => void
): () => void {
  let active = true
  const go = (): void => {
    void load(20)
      .then((result) => {
        if (!active) return
        if (result.ok && result.runs) setState(result.runs, false)
        else setState([], true)
      })
      .catch(() => {
        if (active) setState([], true)
      })
  }
  go()
  const off = onUpdatesChanged(() => {
    if (active) go()
  })
  return () => {
    active = false
    off()
  }
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
    return watchStreamRuns(
      window.app.recentTasks.bind(window.app),
      window.app.onUpdatesChanged.bind(window.app),
      (next, isFailed) => {
        setRuns(next)
        setFailed(isFailed)
      }
    )
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
    shell.navigate('automations', { automationTab: 'updates', focusRunId: row.key })
  }

  if (failed) return <p className="automations-empty">Could not load updates.</p>
  if (!runs.length) {
    return <p className="automations-empty">No updates yet. Run an automation to see results here.</p>
  }
  if (!rows.length) return <p className="automations-empty">You’re all caught up.</p>

  const preview = rows.slice(0, PREVIEW_MAX_ROWS)
  const groups = groupStreamRows(preview)
  const todayKey = localDayKey()

  return (
    <>
      <div aria-label="Recent automation updates">
        {groups.map((group) => (
          <section key={group.key} className="updates-day" aria-label={pastDayLabel(group.key, todayKey)}>
            <h3>{pastDayLabel(group.key, todayKey)} <span>({group.rows.length})</span></h3>
            {group.rows.map((row) => (
              <button
                key={row.key}
                type="button"
                className="updates-row"
                onClick={() => openRow(row)}
                aria-label={`${row.title}, ${row.status.replaceAll('_', ' ')}`}
              >
                <span className="updates-row-meta">
                  <span className="updates-row-icon" aria-hidden="true"><UpdatesGlyph /></span>
                  <strong>{row.title}</strong>
                  <small>{timeLabel(row.at)}</small>
                </span>
                <span className="updates-row-body">{row.body || 'No output recorded yet.'}</span>
              </button>
            ))}
          </section>
        ))}
      </div>
      {rows.length > preview.length && (
        <button type="button" className="updates-more" onClick={() => shell.navigate('automations', { automationTab: 'updates' })}>
          More
        </button>
      )}
    </>
  )
}
