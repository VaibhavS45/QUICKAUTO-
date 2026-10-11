interface CanvasDescribeProps {
  value: string
  busy: boolean
  error: string
  onChange(value: string): void
  onSubmit(): void
  onClose(): void
}

export default function CanvasDescribeBar(props: CanvasDescribeProps): React.JSX.Element {
  return (
    <form
      className="n8n-describe"
      aria-label="Describe the automation"
      onSubmit={(e) => { e.preventDefault(); props.onSubmit() }}
    >
      <button type="button" className="n8n-describe-close" aria-label="Close describe bar" onClick={props.onClose}>×</button>
      <input
        autoFocus
        aria-label="Describe the automation"
        value={props.value}
        onChange={(e) => props.onChange(e.currentTarget.value)}
        placeholder="Describe the automation and the agent will create it…"
      />
      <button type="submit" disabled={!props.value.trim() || props.busy}>
        {props.busy ? 'Creating…' : 'Create'}
      </button>
      {props.error && <p role="alert" className="n8n-describe-error">{props.error}</p>}
    </form>
  )
}
