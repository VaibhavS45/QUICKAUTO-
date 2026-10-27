import { useEffect, useMemo, useState } from 'react'
import type { AutomationCreate } from '../../../../shared/contracts/automations.js'
import type { AutomationTemplate } from '../../../../shared/contracts/automation-templates.js'
import type { AutomationCreateKind } from '../../../shell/nav.js'
import { blankDraft, templateToDraft, type BuilderDraft } from './builder-compile.js'
import Builder from './builder.js'
import StartChoice, { type StartKind } from './start-choice.js'

/**
 * The create flow: pick how it starts, then fill the builder. It belongs to
 * the Automate section, so it renders under the home view.
 */
export function CreateFlow({ kind, template, onPick, onClose, onCreated, onConnect }: {
  kind: AutomationCreateKind
  template?: AutomationTemplate
  onPick(kind: StartKind): void
  onClose(): void
  onCreated(id: string): void
  onConnect(): void
}): React.JSX.Element {
  const [gmailConnected, setGmailConnected] = useState<boolean | undefined>(undefined)
  const builderMode = kind === 'schedule' || kind === 'triggered' || template !== undefined
  // A schedule starts on the clock, a triggered task starts on an app event.
  // The builder shows one or the other, never both in the same "When" box.
  const initial = useMemo<BuilderDraft>(() => {
    if (template) return templateToDraft(template)
    const draft = blankDraft()
    return kind === 'triggered' ? { ...draft, triggers: [] } : draft
  }, [template, kind])

  useEffect(() => {
    if (!builderMode) return
    let active = true
    window.app.connectionStatus('gmail')
      .then((res) => {
        if (active) setGmailConnected(res.ok ? res.connected : undefined)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [builderMode])

  return (
    <>
      {kind === 'choice' && <StartChoice onPick={onPick} onClose={onClose} />}
      {builderMode && (
        <Builder
          key={`${kind}:${template?.id ?? ''}`}
          initial={initial}
          gmailConnected={gmailConnected}
          onConnect={onConnect}
          onClose={onClose}
          onSubmit={async (create: AutomationCreate) => {
            const res = await window.app.automationsCreate(create)
            if (!res.ok || !res.automation) return res.error || 'Could not create the automation.'
            onCreated(res.automation.id)
            return null
          }}
        />
      )}
    </>
  )
}
