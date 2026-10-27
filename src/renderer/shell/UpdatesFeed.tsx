import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ShellApi } from '../contracts/feature.js'
import type { RunLogRecord } from '../../shared/contracts/schedule.js'
import { localDayKey, pastDayLabel, routineTitle, timeLabel } from '../features/automations/shared/dates.js'
import '../features/automations/shared/automations.css'

const POLL_MS = 7000
const PAGE_LIMIT = 100

const STATUS_OPTIONS: RunLogRecord['status'][] = ['running', 'succeeded', 'failed', 'cancelled', 'skipped', 'missed']
const SOURCE_OPTIONS: RunLogRecord['sourceType'][] = ['schedule', 'trigger']

function statusColor(status: RunLogRecord['status']): string {
  switch (status) {
    case 'running': return '124 134 245'
    case 'succeeded': return '129 169 137'
    case 'failed': return '194 118 126'
    case 'cancelled': return '143 143 161'
    case 'skipped': return '108 110 120'
    case 'missed': return '108 110 120'
  }
}

function statusLabel(status: RunLogRecord['status']): string {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function sourceIcon(sourceType: RunLogRecord['sourceType']): React.ReactNode {
  if (sourceType === 'trigger') {
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M8 2v12M2 8h12" />
      </svg>
    )
  }
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="3" width="12" height="11" rx="1.5" />
      <path d="M2 6.5h12M5.5 1.5v3M10.5 1.5v3" />
    </svg>
  )
}

export function UpdatesFeed({ shell }: { shell: ShellApi }): React.JSX.Element {
  const [logs, setLogs] = useState<RunLogRecord[]>([])
  const [nextCursor, setNextCursor] = useState<string | undefined>(undefined)
  const [routines, setRoutines] = useState<Array<{ id: string; prompt: string; tools: string[]; runAt: number; repeat: string; enabled: boolean }>>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [filters, setFilters] = useState<{ status: RunLogRecord['status'][]; sourceType: RunLogRecord['sourceType'][]; task: string; from: number | null; to: number | null }>({
    status: [], sourceType: [], task: '', from: null, to: null
  })
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const todayKey = localDayKey()

  const loadPage = useCallback(async (cursor?: string): Promise<void> => {
    try {
      const result = await shell.updatesList({ limit: PAGE_LIMIT, cursor, ...(filters.status.length ? { status: filters.status } : {}), ...(filters.sourceType.length ? { sourceType: filters.sourceType } : {}), ...(filters.task ? { task: filters.task } : {}), ...(filters.from !== null ? { from: filters.from } : {}), ...(filters.to !== null ? { to: filters.to } : {}) })
      if (!result.ok) throw new Error(result.error || 'Could not load updates.')
      if (cursor === undefined) {
        setLogs(result.logs ?? [])
        setNextCursor(result.nextCursor)
      } else {
        setLogs((prev) => [...prev, ...(result.logs ?? [])])
        setNextCursor(result.nextCursor)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load updates.')
    } finally {
      setLoading(false)
    }
  }, [shell, filters.status, filters.sourceType, filters.task, filters.from, filters.to])

  const loadRoutines = useCallback(async (): Promise<void> => {
    try {
      const result = await window.app.routineList()
      if (result.ok && result.routines) setRoutines(result.routines)
    } catch {}
  }, [])

  useEffect(() => {
    let active = true
    let cursor: string | undefined
    const go = async (): Promise<void> => {
      setLoading(true)
      await loadPage(cursor)
      cursor = nextCursor
      await loadRoutines()
      if (active) setLoading(false)
    }
    go()
    const off = shell.onUpdatesChanged(() => {
      void go()
    })
    pollRef.current = setInterval(() => {
      void go()
    }, POLL_MS)
    return () => {
      active = false
      off()
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [shell, loadPage, loadRoutines, nextCursor])

  const loadMore = useCallback((): void => {
    if (loading || !nextCursor) return
    void loadPage(nextCursor)
  }, [loading, nextCursor, loadPage])

  const runningLog = logs.find((log) => log.status === 'running')
  const todayLogs = logs.filter((log) => localDayKey(new Date(log.startedAt)) === todayKey)
  const failuresToday = todayLogs.filter((log) => log.status === 'failed').length
  const activeCount = routines.filter((r) => r.enabled).length
  const lastSucceeded = logs.find((log) => log.status === 'succeeded')

  const nowStart = runningLog ? new Date(runningLog.startedAt).getTime() : null
  const nowElapsed = nowStart ? Math.max(0, Date.now() - nowStart) : 0

  const nextRun = useMemo((): { title: string; at: number } | null => {
    const now = Date.now()
    const upcoming = routines
      .filter((r) => r.enabled)
      .map((r) => ({ title: routineTitle(r.prompt), at: r.runAt }))
      .filter((x) => x.at > now)
      .sort((a, b) => a.at - b.at)
    return upcoming[0] ?? null
  }, [routines])

  const idleNode = nextRun ? (
    <>
      <strong>Idle.</strong> Next run: <strong>{nextRun.title}</strong> at {timeLabel(nextRun.at)}
    </>
  ) : (
    <>
      <strong>Idle.</strong> No upcoming schedules or triggers.
    </>
  )

  const filteredLogs = useMemo((): RunLogRecord[] => {
    return logs.filter((log) => {
      if (filters.status.length && !filters.status.includes(log.status)) return false
      if (filters.sourceType.length && !filters.sourceType.includes(log.sourceType)) return false
      if (filters.task && !log.taskTitle.toLowerCase().includes(filters.task.toLowerCase())) return false
      if (filters.from !== null && log.startedAt < filters.from) return false
      if (filters.to !== null && log.startedAt > filters.to) return false
      return true
    })
  }, [logs, filters])

  const grouped = useMemo(() => {
    const byDay = new Map<string, RunLogRecord[]>()
    for (const log of filteredLogs) {
      const key = localDayKey(new Date(log.startedAt))
      const list = byDay.get(key) ?? []
      list.push(log)
      byDay.set(key, list)
    }
    return [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0]))
  }, [filteredLogs])

  const durationMs = (log: RunLogRecord): number => {
    const end = log.finishedAt ?? Date.now()
    return Math.max(0, end - log.startedAt)
  }
  const durationLabel = (log: RunLogRecord): string => {
    const ms = durationMs(log)
    const s = Math.floor(ms / 1000)
    if (s < 60) return `${s}s`
    const m = Math.floor(s / 60)
    return `${m}m ${s % 60}s`
  }

  const openInManage = (run: RunLogRecord): void => {
    shell.navigate('automations', { automationTab: 'manage', focusId: run.taskId })
    setExpanded(null)
  }

  if (loading && !logs.length) {
    return (
      <section className="updates-feed" aria-label="Activity feed">
        <p className="automations-empty">Loading activity…</p>
      </section>
    )
  }

  return (
    <section className="updates-feed" aria-label="Activity feed">

      {/* Right now */}
      <section className="updates-right-now">
        <h3 className="updates-section-title">Right now</h3>
        {runningLog ? (
          <>
            <span className={`updates-badge updates-badge--running`} style={{ backgroundColor: `rgb(${statusColor('running')} / 0.12)`, color: `rgb(${statusColor('running')})` }} aria-hidden="true">●</span>
            <div>
              <strong>{routineTitle(runningLog.taskTitle)}</strong>
              <p className="updates-right-now-step">{runningLog.currentStep ? `Running step: ${runningLog.currentStep}` : 'Running…'}</p>
              <span className="updates-right-now-meta">{timeLabel(runningLog.startedAt)} · elapsed {(nowElapsed / 1000).toFixed(0)}s</span>
            </div>
          </>
        ) : (
          <>
            <span className="updates-badge updates-badge--idle" aria-hidden="true">○</span>
            <div>
              {idleNode}
            </div>
          </>
        )}
      </section>

      {/* Summary strip */}
      <section className="updates-summary">
        <div className="updates-summary-item">
          <span className="updates-summary-value">{activeCount}</span>
          <span className="updates-summary-label">Active schedules</span>
        </div>
        <div className="updates-summary-item">
          <span className="updates-summary-value">{todayLogs.length}</span>
          <span className="updates-summary-label">Runs today</span>
        </div>
        <div className={`updates-summary-item${failuresToday ? ' is-fail' : ''}`}>
          <span className="updates-summary-value" style={{ color: failuresToday ? `rgb(${statusColor('failed')})` : 'inherit' }}>{failuresToday}</span>
          <span className="updates-summary-label">Failures today</span>
        </div>
        <div className="updates-summary-item">
          <span className="updates-summary-value">{lastSucceeded ? timeLabel(lastSucceeded.finishedAt ?? lastSucceeded.startedAt) : '—'}</span>
          <span className="updates-summary-label">Last successful run</span>
        </div>
      </section>

      {/* Filters */}
      <section className="updates-filters">
        <button type="button" className="updates-filter-btn" onClick={() => {}}>Filters</button>
        <div className="updates-filter-chip-row">
          {STATUS_OPTIONS.map((status) => (
            <button key={status} type="button" className={`updates-filter-chip${filters.status.includes(status) ? ' is-on' : ''}`} onClick={() => {
              const next = filters.status.includes(status) ? filters.status.filter((s) => s !== status) : [...filters.status, status]
              setFilters((prev) => ({ ...prev, status: next }))
            }}>
              {statusLabel(status)}
            </button>
          ))}
          {SOURCE_OPTIONS.map((sourceType) => (
            <button key={sourceType} type="button" className={`updates-filter-chip${filters.sourceType.includes(sourceType) ? ' is-on' : ''}`} onClick={() => {
              const next: RunLogRecord['sourceType'][] = filters.sourceType.includes(sourceType)
                ? filters.sourceType.filter((s) => s !== sourceType)
                : [...filters.sourceType, sourceType]
              setFilters((prev) => ({ ...prev, sourceType: next }))
            }}>
              {sourceType === 'schedule' ? 'Schedule' : 'Trigger'}
            </button>
          ))}
        </div>
        {filters.task && (
          <span className="updates-active-filter">Task: “{filters.task}” <button type="button" className="updates-remove-filter" onClick={() => setFilters((prev) => ({ ...prev, task: '' }))}>×</button></span>
        )}
        {filters.from !== null && (
          <span className="updates-active-filter">From: {new Date(filters.from!).toLocaleDateString()} <button type="button" className="updates-remove-filter" onClick={() => setFilters((prev) => ({ ...prev, from: null }))}>×</button></span>
        )}
      </section>

      {/* Error */}
      {error && <p className="automations-error" role="alert">{error}</p>}

      {/* Empty state */}
      {!error && filteredLogs.length === 0 && (
        <div className="updates-empty">
          <p>No activity yet.</p>
          <p>Runs from your schedules and triggers will appear here.</p>
          <button type="button" className="updates-go-manage" onClick={() => shell.navigate('automations', { automationTab: 'manage' })}>Open Manage</button>
        </div>
      )}

      {/* Feed */}
      {!error && filteredLogs.length > 0 && (
        <>
          {grouped.map(([dayKey, dayLogs]) => (
            <section key={dayKey} className="updates-day" aria-label={pastDayLabel(dayKey, todayKey)}>
              <h3>{pastDayLabel(dayKey, todayKey)} <span>({dayLogs.length})</span></h3>
              {dayLogs.sort((a, b) => b.startedAt - a.startedAt).map((log) => {
                const isExpanded = expanded === log.runId
                return (
                  <article key={log.runId} className={`updates-item${isExpanded ? ' is-expanded' : ''}`}>
                    <button type="button" className="updates-item-head" onClick={() => setExpanded(isExpanded ? null : log.runId)}>
                      <span className={`updates-badge${log.status === 'running' ? ' updates-badge--running' : ''}`} style={{ backgroundColor: `rgb(${statusColor(log.status)} / 0.12)`, color: `rgb(${statusColor(log.status)})` }} aria-label={statusLabel(log.status)}>{log.status === 'running' ? '●' : '◆'}</span>
                      <span className="updates-item-source">{sourceIcon(log.sourceType)} <span>{log.sourceType === 'schedule' ? 'Schedule' : 'Trigger'}</span></span>
                      <div className="updates-item-main">
                        <strong className="updates-item-title">{routineTitle(log.taskTitle)}</strong>
                        <span className="updates-item-times">{timeLabel(log.startedAt)}{log.finishedAt ? ` · ${timeLabel(log.finishedAt)}` : ''} <span>· {durationLabel(log)}</span></span>
                      </div>
                      {log.error && <span className="updates-item-error">⚠ {log.error}</span>}
                    </button>
                    {isExpanded && (
                      <section className="updates-item-log">
                        <h4>Step log</h4>
                        {log.steps.length === 0 && <p className="automations-empty">No step details recorded.</p>}
                        {log.steps.map((step, i) => (
                          <div key={i} className="updates-step">
                            <span className="updates-step-time">{timeLabel(step.timestamp)}</span>
                            <span className="updates-step-tool">{step.tool}</span>
                            {step.input !== undefined && <span className="updates-step-note">input: {String(step.input).slice(0, 160)}</span>}
                            {step.outputPreview && <span className="updates-step-note">output: {step.outputPreview}</span>}
                          </div>
                        ))}
                        {log.taskId && (
                          <button type="button" className="updates-open-manage" onClick={(e) => { e.stopPropagation(); openInManage(log) }}>
                            Open in Manage
                          </button>
                        )}
                      </section>
                    )}
                  </article>
                )
              })}
              {dayLogs.length === PAGE_LIMIT && nextCursor && (
                <button type="button" className="updates-load-more" onClick={loadMore}>Load more</button>
              )}
            </section>
          ))}
        </>
      )}
    </section>
  )
}
