import { useMemo, useState } from 'react'
import { Check, ChevronDown, ChevronLeft, ChevronUp, Copy, File, Play, Search } from 'lucide-react'
import type { RunRecord } from '../../../shared/contracts/schedule.js'
import { formatDate, formatTime } from '../../lib/format.js'
import { localDayKey, routineTitle } from './dates.js'
import './updates-ui.css'

/* ------------------------------------------------------------------ pure helpers */

export type RunFilter = 'all' | 'running' | 'succeeded' | 'failed' | 'skipped' | 'missed'
export type RunTone = 'ok' | 'bad' | 'live' | 'idle'

export const FEED_FILTERS: ReadonlyArray<{ id: RunFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'running', label: 'Running' },
  { id: 'succeeded', label: 'Succeeded' },
  { id: 'failed', label: 'Failed' },
  { id: 'skipped', label: 'Skipped' },
  { id: 'missed', label: 'Missed' }
]
export const RAIL_FILTERS = FEED_FILTERS.filter((f) => f.id === 'all' || f.id === 'succeeded' || f.id === 'failed')

export function matchesFilter(status: string, filter: RunFilter): boolean {
  switch (filter) {
    case 'all': return true
    case 'running': return status === 'running'
    case 'succeeded': return status === 'succeeded' || status === 'done'
    case 'failed': return status === 'failed'
    case 'skipped': return status === 'skipped' || status === 'skipped_budget'
    case 'missed': return status === 'missed'
  }
}

export function statusTone(status: string): RunTone {
  if (status === 'succeeded' || status === 'done') return 'ok'
  if (status === 'failed') return 'bad'
  if (status === 'running' || status === 'waiting-approval') return 'live'
  return 'idle'
}

export function statusLabel(status: string): string {
  if (status === 'skipped_budget') return 'Skipped'
  if (status === 'done') return 'Succeeded'
  const text = status.replaceAll('_', ' ').replaceAll('-', ' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function newestFirst(runs: RunRecord[]): RunRecord[] {
  return [...runs].sort((a, b) => b.startedAt - a.startedAt)
}

/** "OCT 11, 2026" */
export function dayHeading(key: string): string {
  return formatDate(new Date(`${key}T00:00:00`)).toUpperCase()
}

export function groupByDay(runs: RunRecord[]): { key: string; label: string; runs: RunRecord[] }[] {
  const byDay = new Map<string, RunRecord[]>()
  for (const run of runs) {
    const key = localDayKey(new Date(run.startedAt))
    byDay.set(key, [...(byDay.get(key) ?? []), run])
  }
  return [...byDay.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, list]) => ({ key, label: dayHeading(key), runs: list }))
}

/** "Oct 11, 2026 · 7:06 PM" */
export function runStamp(at: number): string {
  return `${formatDate(at)} · ${formatTime(at)}`
}

export function runOutput(run: Pick<RunRecord, 'summary'>): string {
  return (run.summary ?? '').trim()
}

/* ------------------------------------------------------------------ shared bits */

function BackLink({ onBack }: { onBack?: () => void }): React.JSX.Element {
  return (
    <button type="button" className="run-back" onClick={onBack}>
      <ChevronLeft size={14} aria-hidden="true" />
      <span>Back to Updates</span>
    </button>
  )
}

function CopyButton({ text }: { text: string }): React.JSX.Element {
  const [done, setDone] = useState(false)
  const copy = (): void => {
    void navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setDone(true)
        window.setTimeout(() => setDone(false), 1500)
      })
      .catch(() => {})
  }
  return (
    <button type="button" className="run-copy" onClick={copy} disabled={!text}>
      {done ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
      {done ? 'Copied' : 'Copy'}
    </button>
  )
}

/* ------------------------------------------------------------------ B · Activity feed */

export function UpdatesList({ runs, onBack }: { runs: RunRecord[]; onBack?: () => void }): React.JSX.Element {
  const sorted = useMemo(() => newestFirst(runs), [runs])
  const [filter, setFilter] = useState<RunFilter>('all')
  const [openId, setOpenId] = useState<string | null>(() => sorted[0]?.id ?? null)
  const groups = useMemo(() => groupByDay(sorted.filter((run) => matchesFilter(run.status, filter))), [sorted, filter])

  return (
    <section className="run-feed" aria-label="Updates">
      <div className="run-feed-inner">
        <BackLink {...(onBack ? { onBack } : {})} />
        <h1 className="run-feed-title">Updates</h1>
        <p className="run-feed-sub">Every run, newest first. Open a run to read its output.</p>

        <div className="run-pills" role="group" aria-label="Filter runs">
          {FEED_FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`run-pill${filter === item.id ? ' is-on' : ''}`}
              aria-pressed={filter === item.id}
              onClick={() => setFilter(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {sorted.length === 0 && <p className="run-empty">No outputs yet. Run an automation to see results here.</p>}
        {sorted.length > 0 && groups.length === 0 && <p className="run-empty">No runs match this filter.</p>}

        {groups.map((group) => (
          <section key={group.key} className="run-day" aria-label={group.label}>
            <div className="run-day-head">
              <span>{group.label}</span>
              <i aria-hidden="true" />
              <span>{group.runs.length} {group.runs.length === 1 ? 'RUN' : 'RUNS'}</span>
            </div>
            <ol className="run-timeline">
              {group.runs.map((run) => {
                const open = openId === run.id
                const tone = statusTone(run.status)
                const output = runOutput(run)
                return (
                  <li key={run.id} className={`run-item is-${tone}`}>
                    <span className="run-node" aria-hidden="true"><b /></span>
                    <article className={`run-card${open ? ' is-open' : ''}`}>
                      <button
                        type="button"
                        className="run-card-head"
                        aria-expanded={open}
                        onClick={() => setOpenId(open ? null : run.id)}
                      >
                        <span className="run-card-main">
                          <strong>{routineTitle(run.title)}</strong>
                          <time>{formatTime(run.startedAt)}</time>
                        </span>
                        <span className={`run-chip is-${tone}`}>{statusLabel(run.status)}</span>
                        {open ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
                      </button>
                      {open && (
                        <div className="run-card-body">
                          <div className="run-label-row">
                            <span className="run-kicker">Output</span>
                            <CopyButton text={output} />
                          </div>
                          <pre className="run-code">{output || 'No output recorded yet.'}</pre>
                        </div>
                      )}
                    </article>
                  </li>
                )
              })}
            </ol>
          </section>
        ))}
      </div>
    </section>
  )
}

/* ------------------------------------------------------------------ A · Run detail (master / detail) */

export function RunDetailPage({ run, runs, onSelect, onBack, onViewAll, onRunAgain }: {
  run: RunRecord
  runs: RunRecord[]
  onSelect(run: RunRecord): void
  onBack(): void
  onViewAll?(): void
  onRunAgain?(): void | Promise<void>
}): React.JSX.Element {
  const sorted = useMemo(() => newestFirst(runs), [runs])
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<RunFilter>('all')
  const [busy, setBusy] = useState(false)

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return sorted.filter((item) =>
      matchesFilter(item.status, filter) &&
      (!needle || routineTitle(item.title).toLowerCase().includes(needle) || runOutput(item).toLowerCase().includes(needle))
    )
  }, [sorted, query, filter])
  const groups = useMemo(() => groupByDay(visible), [visible])

  const position = sorted.findIndex((item) => item.id === run.id) + 1
  const output = runOutput(run)
  const tone = statusTone(run.status)

  const runAgain = async (): Promise<void> => {
    if (!onRunAgain || busy) return
    setBusy(true)
    try { await onRunAgain() } finally { setBusy(false) }
  }

  return (
    <section className="run-page" aria-label="Run details">
      <div className="run-page-inner">
        <BackLink onBack={onBack} />
        <div className="run-split">
          <aside className="run-rail" aria-label="All runs">
            <header className="run-rail-head">
              <h2>Runs</h2>
              <span className="run-count">{runs.length}</span>
            </header>
            <label className="run-search">
              <Search size={14} aria-hidden="true" />
              <input
                type="search"
                placeholder="Search runs"
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                aria-label="Search runs"
              />
            </label>
            <div className="run-pills is-small" role="group" aria-label="Filter runs">
              {RAIL_FILTERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`run-pill${filter === item.id ? ' is-on' : ''}`}
                  aria-pressed={filter === item.id}
                  onClick={() => setFilter(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="run-rail-list">
              {groups.length === 0 && <p className="run-empty is-rail">No runs found.</p>}
              {groups.map((group) => (
                <section key={group.key} aria-label={group.label}>
                  <p className="run-kicker run-rail-day">{group.label}</p>
                  {group.runs.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className={`run-row is-${statusTone(item.status)}${item.id === run.id ? ' is-active' : ''}`}
                      aria-current={item.id === run.id}
                      onClick={() => onSelect(item)}
                    >
                      <span className="run-dot" aria-hidden="true" />
                      <span className="run-row-main">
                        <strong>{routineTitle(item.title)}</strong>
                        <small>{statusLabel(item.status)}</small>
                      </span>
                      <time>{formatTime(item.startedAt)}</time>
                    </button>
                  ))}
                </section>
              ))}
            </div>
          </aside>

          <article className="run-detail" aria-label={routineTitle(run.title)}>
            <div className="run-detail-top">
              <span className="run-kicker">Run output</span>
              <span className={`run-pillchip is-${tone}`}>
                {tone === 'ok' && <Check size={12} aria-hidden="true" />}
                {statusLabel(run.status)}
              </span>
            </div>
            <h2 className="run-detail-title">{routineTitle(run.title)}</h2>

            <dl className="run-meta">
              <div><dt>Started</dt><dd>{runStamp(run.startedAt)}</dd></div>
              <div><dt>Status</dt><dd>{statusLabel(run.status)}</dd></div>
              <div><dt>Run</dt><dd>{position} of {sorted.length}</dd></div>
            </dl>

            <div className="run-label-row">
              <span className="run-kicker">Output</span>
              <CopyButton text={output} />
            </div>
            {output ? (
              <pre className="run-code is-block">{output}</pre>
            ) : (
              <div className="run-blank">
                <span className="run-blank-icon" aria-hidden="true"><File size={16} /></span>
                <strong>No output recorded yet.</strong>
                <p>This run finished without returning any text.</p>
              </div>
            )}

            <div className="run-actions">
              <button type="button" className="run-primary" onClick={() => void runAgain()} disabled={!onRunAgain || busy}>
                <Play size={12} fill="currentColor" aria-hidden="true" />
                Run again
              </button>
              <button type="button" className="run-secondary" onClick={onViewAll ?? onBack}>View all runs</button>
            </div>
          </article>
        </div>
      </div>
    </section>
  )
}
