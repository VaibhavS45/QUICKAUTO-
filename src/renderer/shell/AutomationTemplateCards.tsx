import { useEffect, useState } from 'react'
import { AUTOMATION_TEMPLATES, type AutomationTemplate } from '../../shared/contracts/automation-templates.js'
import { templateRequirementBadges, type RequirementBadge } from './template-requirements.js'

const TRIGGER_ICONS: Record<string, { glyph: string; className: string }> = {
  gmail: { glyph: 'M', className: 'is-gmail' },
  sheets: { glyph: '▦', className: 'is-cal' },
  github: { glyph: '❖', className: 'is-github' },
  websearch: { glyph: '✦', className: 'is-search' },
  files: { glyph: '▤', className: 'is-files' }
}

/** Short trigger line for the top flow step (pure, unit-tested). */
export function templateTriggerLabel(template: AutomationTemplate): string {
  const trigger = template.trigger
  switch (trigger.kind) {
    case 'schedule':
      if (trigger.at && trigger.repeat) return `${cap(trigger.repeat)} at ${trigger.at}`
      if (trigger.at) return `At ${trigger.at}`
      return 'On a schedule'
    case 'before-event':
      return `${trigger.minutesBefore ?? 10} min before an event`
    case 'file-changed':
      return trigger.path ? `When ${trigger.path} changes` : 'When a file changes'
    case 'webhook':
      return trigger.path ? `When ${trigger.path} arrives` : 'On a webhook'
  }
}

/** Short action line for the bottom flow step (pure, unit-tested). */
export function templateActionLabel(template: AutomationTemplate): string {
  const prompt = template.steps?.[0]?.prompt ?? template.prompt
  return prompt.split(/(?<=[.!?])\s/)[0] ?? prompt
}

function cap(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function triggerIcon(template: AutomationTemplate): { glyph: string; className: string } {
  const key = template.requires.find((id) => TRIGGER_ICONS[id]) ?? 'websearch'
  return TRIGGER_ICONS[key] ?? TRIGGER_ICONS.websearch
}

interface AutomationTemplateCardsProps {
  onSelect(template: AutomationTemplate): void
  onConnect(): void
}

export function AutomationTemplateCards({ onSelect, onConnect }: AutomationTemplateCardsProps): React.JSX.Element {
  const [connected, setConnected] = useState<Record<string, boolean | undefined>>({ websearch: true })
  const [statusError, setStatusError] = useState('')

  useEffect(() => {
    let active = true
    void Promise.all([window.app.getConnector(), window.app.connectionStatus('gmail')])
      .then(([connector, gmail]) => {
        if (!active) return
        const statuses: Record<string, boolean | undefined> = { websearch: true }
        for (const service of connector.services) statuses[service.id] = service.connected
        statuses.gmail = gmail.ok ? gmail.connected : undefined
        setConnected(statuses)
        if (!gmail.ok) setStatusError(gmail.error || 'Could not load Gmail connection status.')
      })
      .catch((error: unknown) => {
        if (active) setStatusError(error instanceof Error ? error.message : String(error))
      })
    return () => { active = false }
  }, [])

  return (
    <section className="shell-template-cards" aria-label="Suggestions">
      {statusError && <p className="shell-template-status-error" role="status">{statusError}</p>}
      <div className="shell-template-grid">
        {AUTOMATION_TEMPLATES.map((template) => {
          const icon = triggerIcon(template)
          return (
            <article className="shell-template-card" key={template.id}>
              <button type="button" className="shell-template-select" onClick={() => onSelect(template)}>
                <span className="shell-template-flow">
                  <span className="shell-flow-step">
                    <span className={`shell-flow-icon ${icon.className}`} aria-hidden>{icon.glyph}</span>
                    <span>{templateTriggerLabel(template)}</span>
                  </span>
                  <span className="shell-flow-arrow" aria-hidden>↓</span>
                  <span className="shell-flow-step">
                    <span className="shell-flow-icon is-action" aria-hidden>✦</span>
                    <span>{templateActionLabel(template)}</span>
                  </span>
                </span>
                <span className="shell-template-title">{template.title}</span>
              </button>
              <div className="shell-template-requirements" aria-label={`${template.title} requirements`}>
                {templateRequirementBadges(template, connected).map((badge) => (
                  <RequirementBadgeView key={badge.id} badge={badge} onConnect={onConnect} />
                ))}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}

function RequirementBadgeView({ badge, onConnect }: { badge: RequirementBadge; onConnect(): void }): React.JSX.Element {
  if (badge.state === 'connect') {
    return (
      <span className="shell-requirement-badge is-connect">
        Needs {badge.label}
        <button type="button" onClick={onConnect}>Connect</button>
      </span>
    )
  }
  const text = badge.state === 'ready'
    ? `${badge.label} ready`
    : badge.state === 'unavailable'
      ? `${badge.label}: Not available yet`
      : `${badge.label} status unavailable`
  return <span className={`shell-requirement-badge is-${badge.state}`}>{text}</span>
}
