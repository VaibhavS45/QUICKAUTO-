import { useEffect, useMemo, useRef, useState } from 'react'
import { AutomationTemplateCards } from './AutomationTemplateCards.js'
import type { AutomationTemplate } from '../../shared/contracts/automation-templates.js'
import { activeMention, parseMentionedTools, TOOL_META } from '../../shared/types.js'

interface ChatComposerProps {
  busy: boolean
  compact?: boolean
  onSend(text: string): Promise<boolean>
  onOpenSettings(): void
  onOpenConnections(): void
  onOpenAutomations(): void
  onSelectTemplate(template: AutomationTemplate): void
}

export function ChatComposer({
  busy,
  compact = false,
  onSend,
  onOpenSettings,
  onOpenConnections,
  onOpenAutomations,
  onSelectTemplate
}: ChatComposerProps): React.JSX.Element {
  const [value, setValue] = useState('')
  const [caret, setCaret] = useState(0)
  const [error, setError] = useState('')
  const [engine, setEngine] = useState('builtin')
  const [installed, setInstalled] = useState<string[]>([])
  const [model, setModel] = useState('')
  const [models, setModels] = useState<Array<{ value: string; name: string }>>([])
  const [modelsError, setModelsError] = useState('')
  const [modelQuery, setModelQuery] = useState('')
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [modelsRefresh, setModelsRefresh] = useState(0)
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

  useEffect(() => {
    let active = true
    void Promise.all([window.app.getAgentProvider(), window.app.detectHarnesses()])
      .then(([provider, detected]) => {
        if (!active) return
        if (provider.ok && provider.provider) setEngine(provider.provider)
        if (detected.ok && detected.harnesses) {
          setInstalled(detected.harnesses.filter((h) => h.installed).map((h) => h.id))
        }
      })
      .catch(() => {
        /* picker keeps builtin; Settings has the full engine list */
      })
    return () => {
      active = false
    }
  }, [])

  async function changeEngine(id: string): Promise<void> {
    setError('')
    const res = (await window.app.setAgentProvider(id)) as { ok: boolean; error?: string }
    if (res.ok) setEngine(id)
    else setError(res.error ?? 'Could not switch engine.')
  }

  useEffect(() => {
    if (engine !== 'opencode') return
    let active = true
    setModelsError('')
    void Promise.all([window.app.opencodeModelGet(), window.app.opencodeModels()])
      .then(([current, list]) => {
        if (!active) return
        if (list.ok && list.options) {
          setModels(list.options)
          setModel(current.ok && current.model ? current.model : (list.current ?? ''))
        } else {
          setModelsError(list.error ?? 'Could not list OpenCode models.')
        }
      })
      .catch(() => {
        if (active) setModelsError('Could not list OpenCode models.')
      })
    return () => {
      active = false
    }
  }, [engine, modelsRefresh])

  async function changeModel(value: string): Promise<void> {
    setError('')
    if (!value) return
    const res = await window.app.opencodeModelSet(value)
    if (res.ok) setModel(value)
    else setError(res.error ?? 'Could not switch model.')
  }

  const availableModels = useMemo(() => {
    const freeModel = { value: 'opencode/muse-spark-1.3-contributor-free', name: 'Muse Spark 1.3 (Free)' }
    return [freeModel, ...models.filter((option) => option.value !== freeModel.value)]
  }, [models])
  const filteredModels = availableModels.filter((option) => {
    const query = modelQuery.trim().toLowerCase()
    return !query || option.name.toLowerCase().includes(query) || option.value.toLowerCase().includes(query)
  })
  const selectedModelName = availableModels.find((option) => option.value === model)?.name ?? (model || 'Choose a model')
  const modelMissing = model === 'opencode/muse-spark-1.3-contributor-free' && models.length > 0 && !models.some((o) => o.value === model)

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
            <span>Engine</span>
            <select aria-label="Engine" value={engine} onChange={(event) => void changeEngine(event.currentTarget.value)}>
              <option value="builtin">Built-in</option>
              <option value="opencode" disabled={!installed.includes('opencode')}>
                OpenCode{installed.includes('opencode') ? '' : ' (not installed)'}
              </option>
              <option value="pi" disabled={!installed.includes('pi')}>
                pi{installed.includes('pi') ? '' : ' (not installed)'}
              </option>
            </select>
          </label>
          {engine === 'opencode' && (
            <div className="chat-agent-picker chat-model-picker">
              <span>Model</span>
              <button
                type="button"
                className="chat-model-trigger"
                aria-haspopup="listbox"
                aria-expanded={modelMenuOpen}
                aria-label="Model"
                onClick={() => setModelMenuOpen((open) => !open)}
              >
                {selectedModelName}
              </button>
              {modelMenuOpen && (
                <div className="chat-model-menu" role="listbox" aria-label="Available OpenCode models">
                  <input
                    autoFocus
                    aria-label="Search models"
                    placeholder="Search models"
                    value={modelQuery}
                    onChange={(event) => setModelQuery(event.currentTarget.value)}
                  />
                  {filteredModels.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      role="option"
                      aria-selected={option.value === model}
                      onClick={() => {
                        void changeModel(option.value)
                        setModelMenuOpen(false)
                        setModelQuery('')
                      }}
                    >
                      <span>{option.name}</span>
                      <small>{option.value}</small>
                    </button>
                  ))}
                  {filteredModels.length === 0 && <p>No models match this search.</p>}
                </div>
              )}
            </div>
          )}
          <span className="chat-tool-selection" aria-label="Selected tools">
            {selectedTools.filter((id) => id !== 'calendar').map((id) => <span key={id}>{TOOL_META[id].label}</span>)}
          </span>
          <button type="button" className="chat-send-button" disabled={busy || !value.trim()} onClick={() => void send()}>
            {busy ? 'Working…' : 'Send'}
          </button>
        </div>
      </div>
      {error && <p className="chat-inline-error" role="alert">{error}</p>}
      {engine === 'opencode' && modelsError && (
        <p className="chat-inline-error" role="alert">
          {modelsError}
          <button type="button" className="chat-inline-action" onClick={() => setModelsRefresh((value) => value + 1)}>
            Refresh models
          </button>
        </p>
      )}
      {modelMissing && (
        <p className="chat-inline-hint">The free OpenCode model is not available for this account. Run `opencode auth login` in a terminal, then refresh the model list.</p>
      )}
      {engine === 'opencode' && /auth|login|provider authentication required/i.test(error) && (
        <p className="chat-inline-hint">OpenCode needs an active provider login. Run `opencode auth login` in a terminal, then click Refresh models and retry.</p>
      )}
      {!compact && (
        <>
          <div className="chat-template-row">
            <span>Get started with automation</span>
            <button type="button" onClick={onOpenAutomations}>＋ New automation</button>
          </div>
          <AutomationTemplateCards
            onSelect={onSelectTemplate}
            onConnect={onOpenConnections}
          />
        </>
      )}
      {error.toLowerCase().includes('api key') && (
        <button type="button" className="chat-settings-link" onClick={onOpenSettings}>Open Provider settings</button>
      )}
    </div>
  )
}
