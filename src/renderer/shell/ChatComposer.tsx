import { useMemo, useRef, useState } from 'react'
import { activeMention, parseMentionedTools, TOOL_META } from '../../shared/types.js'

interface ChatComposerProps {
  busy: boolean
  compact?: boolean
  onSend(text: string): Promise<boolean>
  onOpenSettings(): void
  onOpenAutomations(): void
}

export function ChatComposer({
  busy,
  compact = false,
  onSend,
  onOpenSettings,
  onOpenAutomations
}: ChatComposerProps): React.JSX.Element {
  const [value, setValue] = useState('')
  const [caret, setCaret] = useState(0)
  const [error, setError] = useState('')
  const textarea = useRef<HTMLTextAreaElement>(null)
  const submitting = useRef(false)
  const mention = activeMention(value, caret)
  const suggestions = useMemo(
    () => mention
      ? Object.entries(TOOL_META).filter(([id]) => id.startsWith(mention.typed.toLowerCase())).slice(0, 6)
      : [],
    [mention?.start, mention?.typed]
  )
  const selectedTools = parseMentionedTools(value)

  async function send(): Promise<void> {
    const text = value.trim()
    if (!text || busy || submitting.current) return
    submitting.current = true
    setError('')
    try {
      if (await onSend(text)) setValue('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not start this chat.')
    } finally {
      submitting.current = false
    }
  }

  function insertMention(id: string): void {
    if (!mention) return
    const replacement = `@${id} `
    const next = `${value.slice(0, mention.start)}${replacement}${value.slice(caret)}`
    const nextCaret = mention.start + replacement.length
    setValue(next)
    setCaret(nextCaret)
    requestAnimationFrame(() => {
      textarea.current?.focus()
      textarea.current?.setSelectionRange(nextCaret, nextCaret)
    })
  }

  return (
    <div className={`chat-composer${compact ? ' is-compact' : ''}`}>
      {!compact && (
        <div className="chat-composer-welcome">
          <div className="shell-home-mark" aria-hidden="true">+</div>
          <h2>What can I help with?</h2>
          <p>Start a conversation with your assistant.</p>
        </div>
      )}
      <div className="chat-composer-card">
        <textarea
          ref={textarea}
          aria-label="Message your assistant"
          placeholder="Ask anything. Type @ to choose a tool."
          value={value}
          disabled={busy}
          rows={compact ? 2 : 4}
          onChange={(event) => {
            setValue(event.currentTarget.value)
            setCaret(event.currentTarget.selectionStart)
          }}
          onClick={(event) => setCaret(event.currentTarget.selectionStart)}
          onKeyUp={(event) => setCaret(event.currentTarget.selectionStart)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              if (suggestions.length > 0) {
                event.preventDefault()
                insertMention(suggestions[0]![0])
                return
              }
              event.preventDefault()
              void send()
            }
          }}
        />
        {suggestions.length > 0 && (
          <div className="chat-mention-menu" role="listbox" aria-label="Available tools">
            {suggestions.map(([id, meta]) => (
              <button key={id} type="button" role="option" onMouseDown={(event) => event.preventDefault()} onClick={() => insertMention(id)}>
                <span>{meta.label}</span>
                <small>{meta.hint}</small>
              </button>
            ))}
          </div>
        )}
        <div className="chat-composer-toolbar">
          <label className="chat-agent-picker">
            <span>Agent</span>
            <select aria-label="Agent" value="chat" disabled>
              <option value="chat">Chat</option>
            </select>
          </label>
          <span className="chat-tool-selection" aria-label="Selected tools">
            {selectedTools.filter((id) => id !== 'calendar').map((id) => <span key={id}>{TOOL_META[id].label}</span>)}
          </span>
          <button type="button" className="chat-send-button" disabled={busy || !value.trim()} onClick={() => void send()}>
            {busy ? 'Working…' : 'Send'}
          </button>
        </div>
      </div>
      {error && <p className="chat-inline-error" role="alert">{error}</p>}
      {!compact && (
        <div className="chat-template-row">
          <span>Get started with automation</span>
          <button type="button" onClick={onOpenAutomations}>＋ New automation</button>
        </div>
      )}
      {error.toLowerCase().includes('api key') && (
        <button type="button" className="chat-settings-link" onClick={onOpenSettings}>Open Provider settings</button>
      )}
    </div>
  )
}
