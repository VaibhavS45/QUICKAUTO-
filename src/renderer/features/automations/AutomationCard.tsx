import { Clock, Workflow } from 'lucide-react'
import type { Automation } from '../../../shared/contracts/automations.js'
import { AutomationActionsMenu } from './AutomationActionsMenu.js'
import { automationMeta } from './scheduled.js'

/** One Scheduled Task card. The whole card opens the detail page. */
export function AutomationCard({ automation, onOpen }: {
  automation: Automation
  onOpen(): void
}): React.JSX.Element {
  const paused = automation.status === 'paused'
  return (
    <article
      className={`st-card${paused ? ' is-paused' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={`Open ${automation.title}`}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        onOpen()
      }}
    >
      <div className="st-card-top">
        <span className="st-icon-tile" aria-hidden="true">
          {automation.kind === 'advanced' ? <Workflow size={26} /> : <Clock size={26} />}
        </span>
        <div className="st-card-status">
          <span className={`st-status is-${automation.status}`}>
            <span className="st-dot" aria-hidden="true" />
            {automation.status === 'active' ? 'Active' : 'Paused'}
          </span>
          <AutomationActionsMenu automation={automation} />
        </div>
      </div>
      <p className="st-meta">{automationMeta(automation)}</p>
      <h3 className="st-title">{automation.title}</h3>
      {automation.kind !== 'advanced' && automation.prompt && (
        <p className="st-preview">{automation.prompt}</p>
      )}
    </article>
  )
}
