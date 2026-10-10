import { useEffect, useRef } from 'react'
import type { ChatMessage } from '../../shared/chat.js'
import type { ChatRunState } from './chat-state.js'
import { ApprovalCard } from './ApprovalCard.js'
import { ChatComposer } from './ChatComposer.js'

interface ChatViewProps {
  messages: ChatMessage[]
  run: ChatRunState | null
  busy: boolean
  onSend(text: string): Promise<boolean>
  onApprove(approvalId: string, approved: boolean): void
  onStop(): void
  onOpenSettings(): void
  onOpenAutomations(): void
}

function MarkdownAnswer({ text }: { text: string }): React.JSX.Element {
  return (
    <div className="chat-answer">
      {text.split('\n').map((line, index) => {
        if (/^#{1,3}\s/.test(line)) {
          const heading = line.replace(/^#{1,3}\s/, '')
          return <h3 key={index}>{heading}</h3>
        }
        if (/^\s*[-*]\s/.test(line)) return <p key={index} className="chat-markdown-list">• {line.replace(/^\s*[-*]\s/, '')}</p>
        if (!line) return <br key={index} />
        return <p key={index}>{line}</p>
      })}
    </div>
  )
}

export function ChatView({
  messages,
  run,
  busy,
  onSend,
  onApprove,
  onStop,
  onOpenSettings,
  onOpenAutomations
}: ChatViewProps): React.JSX.Element {
  const showProviderLink = run?.phase === 'error' && /api key|provider/i.test(run.error ?? '')
  const messageList = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = messageList.current
    if (element) element.scrollTop = element.scrollHeight
  }, [messages.length, run?.text, run?.tools.length, run?.approvals.length])

  return (
    <div className="chat-view">
      <div ref={messageList} className="chat-message-list" aria-live="polite">
        {messages.map((message, index) => (
          <article key={`${message.createdAt}-${index}`} className={`chat-message is-${message.role}`}>
            <span className="chat-message-role">{message.role === 'user' ? 'You' : 'Assistant'}</span>
            {message.role === 'assistant' ? <MarkdownAnswer text={message.text} /> : <p>{message.text}</p>}
          </article>
        ))}
        {run && run.tools.length > 0 && (
          <div className="chat-tool-list" aria-label="Tool activity">
            {run.tools.map((tool) => (
              <span key={tool.callId} className={`chat-tool-chip is-${tool.status}`}>
                {tool.name} · {tool.status.replace('-', ' ')}
              </span>
            ))}
          </div>
        )}
        {run?.approvals.map((approval) => (
          <ApprovalCard
            key={approval.approvalId}
            approval={approval}
            disabled={busy && run.phase !== 'running'}
            onDecide={onApprove}
          />
        ))}
        {run?.phase === 'running' && run.text && (
          <article className="chat-message is-assistant"><span className="chat-message-role">Assistant</span><MarkdownAnswer text={run.text} /></article>
        )}
        {run?.phase === 'running' && !run.text && run.tools.length === 0 && (
          <p className="chat-run-status" role="status">Thinking…</p>
        )}
        {run?.phase === 'error' && (
          <div className="chat-run-error" role="alert">
            <p>{run.error || 'The run failed.'}</p>
            {showProviderLink && <button type="button" onClick={onOpenSettings}>Open Provider settings</button>}
          </div>
        )}
        {run?.phase === 'aborted' && <p className="chat-run-status" role="status">Run stopped.</p>}
      </div>
      <div className="chat-view-composer">
        {busy && <button type="button" className="chat-stop-button" onClick={onStop}>Stop</button>}
        <ChatComposer
          compact
          busy={busy}
          onSend={onSend}
          onOpenSettings={onOpenSettings}
          onOpenAutomations={onOpenAutomations}
        />
      </div>
    </div>
  )
}
