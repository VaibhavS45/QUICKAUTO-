export type StartKind = 'schedule' | 'triggered' | 'advanced'

interface StartChoiceProps {
  onPick(kind: StartKind): void
  onClose(): void
}

function ScheduleIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 1.8" />
    </svg>
  )
}

function TriggeredIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M13.2 2.5 5 13.4h5.6L10 21.5l8.2-10.9h-5.6l.6-8.1Z" />
    </svg>
  )
}

function AdvancedIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="5" r="2.6" />
      <circle cx="5.5" cy="18.5" r="2.6" />
      <circle cx="18.5" cy="18.5" r="2.6" />
      <path d="M10.7 7.3 7 16.2M13.3 7.3 17 16.2" />
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
  { kind: 'advanced', title: 'Advanced automation', subtitle: 'Describe when Palette should act', icon: <AdvancedIcon />, badge: 'Beta' }
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
