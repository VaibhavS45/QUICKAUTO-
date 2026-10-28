import { Clock, Workflow, Zap } from 'lucide-react'
import type { Automation } from '../../../../shared/contracts/automations.js'
import { AutomationActionsMenu } from './AutomationActionsMenu.js'
import { automationMeta, manageFilterOf, splitTriggerPrompt } from './scheduled.js'

/** One Scheduled Task card. The whole card opens the detail page. */
export function AutomationCard({ automation, onOpen }: {
  automation: Automation
  onOpen(): void
}): React.JSX.Element {
  const paused = automation.status === 'paused'
  const isTrigger = manageFilterOf(automation) === 'trigger'
  const isAdvanced = automation.kind === 'advanced'
  const split = isTrigger ? splitTriggerPrompt(automation.prompt) : null
  const displayPrompt = split?.task || automation.prompt

  return (
    <article
      className={`st-card${paused ? ' is-paused' : ''}${isTrigger ? ' is-trigger' : ''}`}
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
          {isAdvanced ? <Workflow size={24} /> : isTrigger ? <Zap size={24} /> : <Clock size={24} />}
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
      {displayPrompt && (
        <p className="st-preview">{displayPrompt}</p>
      )}
    </article>
  )
}
