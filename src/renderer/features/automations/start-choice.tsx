export type StartKind = 'schedule' | 'triggered' | 'advanced'

interface StartChoiceProps {
  onPick(kind: StartKind): void
  onClose(): void
}

function ScheduleIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

function TriggeredIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="13" width="8" height="8" rx="1.5" />
      <path d="M11 7h4a2 2 0 0 1 2 2v4" />
    </svg>
  )
}

function AdvancedIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="M8.2 10.8 15.7 7M8.2 13.2l7.5 3.8" />
    </svg>
  )
}

function CloseIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  )
}

export const START_OPTIONS: { kind: StartKind; title: string; subtitle: string; icon: React.ReactNode; badge?: string }[] = [
  { kind: 'schedule', title: 'Schedule', subtitle: 'Run at a time you choose', icon: <ScheduleIcon /> },
  { kind: 'triggered', title: 'Triggered task', subtitle: 'Start from activity in your apps', icon: <TriggeredIcon /> },
  { kind: 'advanced', title: 'Advanced automation', subtitle: 'Describe when Manus should act', icon: <AdvancedIcon />, badge: 'Beta' }
]

export default function StartChoice(props: StartChoiceProps): React.JSX.Element {
  return (
    <div className="builder-overlay" role="dialog" aria-modal="true" aria-label="Choose how it starts" onPointerDown={(e) => { if (e.target === e.currentTarget) props.onClose() }}>
      <div className="builder-card start-card">
        <div className="builder-when-head">
          <strong>Choose how it starts</strong>
          <button type="button" aria-label="Close" onClick={props.onClose}><CloseIcon /></button>
        </div>
        <div className="start-grid">
          {START_OPTIONS.map((opt) => (
            <button key={opt.kind} type="button" className="start-opt" onClick={() => props.onPick(opt.kind)}>
              <span className="start-icon" aria-hidden="true">{opt.icon}</span>
              <span className="start-titles">
                <strong>{opt.title}{opt.badge && <span className="start-badge">{opt.badge}</span>}</strong>
                <small>{opt.subtitle}</small>
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
