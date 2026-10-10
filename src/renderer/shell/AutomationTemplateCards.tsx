import { useEffect, useState } from 'react'
import { AUTOMATION_TEMPLATES, type AutomationTemplate } from '../../shared/contracts/automation-templates.js'
import { templateRequirementBadges, type RequirementBadge } from './template-requirements.js'

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
    <section className="shell-template-cards" aria-label="Automation templates">
      <header>
        <h2>Start with a template</h2>
        <span>Choose a workflow to customize</span>
      </header>
      {statusError && <p className="shell-template-status-error" role="status">{statusError}</p>}
      <div className="shell-template-grid">
        {AUTOMATION_TEMPLATES.map((template) => (
          <article className="shell-template-card" key={template.id}>
            <button type="button" className="shell-template-select" onClick={() => onSelect(template)}>
              <strong>{template.title}</strong>
              <span>{template.description}</span>
            </button>
            <div className="shell-template-requirements" aria-label={`${template.title} requirements`}>
              {templateRequirementBadges(template, connected).map((badge) => (
                <RequirementBadgeView key={badge.id} badge={badge} onConnect={onConnect} />
              ))}
            </div>
          </article>
        ))}
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
