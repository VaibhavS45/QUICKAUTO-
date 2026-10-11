export type StartKind = 'schedule' | 'triggered' | 'advanced'

interface StartChoiceProps {
  onPick(kind: StartKind): void
  onClose(): void
}

export const START_OPTIONS: { kind: StartKind; title: string; subtitle: string; icon: string; badge?: string }[] = [
  { kind: 'schedule', title: 'Schedule', subtitle: 'Run at a time you choose', icon: '◷' },
  { kind: 'triggered', title: 'Triggered task', subtitle: 'Start from activity in your apps', icon: '⧉' },
  { kind: 'advanced', title: 'Advanced automation', subtitle: 'Describe when the automation should run', icon: '⟁', badge: 'Beta' }
]

export default function StartChoice(props: StartChoiceProps): React.JSX.Element {
  return (
    <div className="builder-overlay" role="dialog" aria-modal="true" aria-label="Choose how it starts" onPointerDown={(e) => { if (e.target === e.currentTarget) props.onClose() }}>
      <div className="builder-card start-card">
        <div className="builder-when-head">
          <strong>Choose how it starts</strong>
          <button type="button" aria-label="Close" onClick={props.onClose}>×</button>
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
