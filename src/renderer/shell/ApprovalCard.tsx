import type { ChatApproval } from './chat-state.js'

interface ApprovalCardProps {
  approval: ChatApproval
  disabled: boolean
  onDecide(approvalId: string, approved: boolean): void
}

function inputSummary(input: unknown): string {
  if (typeof input === 'string') return input.slice(0, 4000)
  try {
    return JSON.stringify(input, null, 2)?.slice(0, 4000) ?? 'No tool details available.'
  } catch {
    return 'Tool details could not be displayed.'
  }
}

export function ApprovalCard({ approval, disabled, onDecide }: ApprovalCardProps): React.JSX.Element {
  return (
    <section className="chat-approval-card" aria-label={`Approval needed for ${approval.toolName}`}>
      <div>
        <strong>Allow {approval.toolName}?</strong>
        {approval.reason && <p>{approval.reason}</p>}
        <pre>{inputSummary(approval.input)}</pre>
      </div>
      <div className="chat-approval-actions">
        <button type="button" disabled={disabled} onClick={() => onDecide(approval.approvalId, false)}>Deny</button>
        <button type="button" disabled={disabled} onClick={() => onDecide(approval.approvalId, true)}>Approve</button>
      </div>
    </section>
  )
}
