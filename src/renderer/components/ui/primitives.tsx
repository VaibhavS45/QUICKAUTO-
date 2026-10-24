import './primitives.css'

export type RunStatus =
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'skipped'
  | 'missed'
  | 'active'
  | 'paused'
  | 'idle'
  | 'waiting-approval'
  | 'cancelled'
  | 'skipped_budget'

const STATUS_LABEL: Record<RunStatus, string> = {
  running: 'Running',
  succeeded: 'Succeeded',
  failed: 'Failed',
  skipped: 'Skipped',
  missed: 'Missed',
  active: 'Scheduled',
  paused: 'Went cold',
  idle: 'Idle',
  'waiting-approval': 'Waiting approval',
  cancelled: 'Cancelled',
  skipped_budget: 'Skipped — out of budget'
}

function SuccessCheck(): React.JSX.Element {
  return (
    <svg className="p-status-check" viewBox="0 0 10 10" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" aria-hidden="true">
      <path d="M1.5 5.5 4 8l4.5-5.5" />
    </svg>
  )
}

/**
 * The one status badge. Heat statuses pulse in ember; the rest go cold.
 */
export function StatusBadge({ status, label }: { status: RunStatus; label?: string }): React.JSX.Element {
  return (
    <span className={`p-status p-status--${status}`}>
      {status === 'succeeded' ? <SuccessCheck /> : <span className="p-status-dot" aria-hidden="true" />}
      {label ?? STATUS_LABEL[status]}
    </span>
  )
}

/** Empty/zero-data state with an optional call to action. */
export function EmptyState({ title, body, action }: {
  title: string
  body?: string
  action?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="p-empty">
      <p className="p-empty-title">{title}</p>
      {body && <p className="p-empty-body">{body}</p>}
      {action && <div className="p-empty-action">{action}</div>}
    </div>
  )
}

/** Page header row: title left, actions right. */
export function PageHeader({ title, kicker, actions }: {
  title: string
  kicker?: React.ReactNode
  actions?: React.ReactNode
}): React.JSX.Element {
  return (
    <header className="p-page-head">
      <div className="p-page-head-titles">
        {kicker && <p className="p-page-head-kicker">{kicker}</p>}
        <h2 className="p-page-head-title">{title}</h2>
      </div>
      {actions && <div className="p-page-head-actions">{actions}</div>}
    </header>
  )
}

/** Status color as a token name, for inline SVG/data surface coloring. */
export function statusToken(status: string): string {
  switch (status) {
    case 'running': return 'var(--ember)'
    case 'succeeded': return 'var(--ash-1)'
    case 'failed': return 'var(--danger)'
    case 'paused': return 'var(--ash-3)'
    case 'active': return 'var(--ember)'
    case 'missed': return 'var(--ember-deep)'
    default: return 'var(--ash-3)'
  }
}
