import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Automation } from '../../../shared/contracts/automations.js'
import { AutomationActionsProvider, type AutomationActions } from './automation-actions.js'
import { AutomationCard } from './AutomationCard.js'
import { AutomationDetail } from './AutomationDetail.js'
import { ConfirmDialog } from './ConfirmDialog.js'
import { ToastStack, useToasts } from './toast.js'
import './scheduled.css'

/**
 * Scheduled Tasks: the card grid, the detail/edit page and the shared
 * "⋯" actions menu.
 */
export default function ScheduledTasks({ onCreate, onOpenRun, onDirtyChange, onSelect, selectedId = '', onlyActive = false, focusAutomationId = '' }: {
  onCreate(): void
  onOpenRun(runId: string): void
  onDirtyChange(dirty: boolean): void
  /** The owner keeps the open automation: the section hides its title row for it. */
  onSelect(id: string): void
  selectedId?: string
  onlyActive?: boolean
  focusAutomationId?: string
}): React.JSX.Element {
  const [automations, setAutomations] = useState<Automation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [focusSchedule, setFocusSchedule] = useState(0)
  const [dirty, setDirty] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const { toasts, push, dismiss } = useToasts()

  const load = useCallback(async (): Promise<void> => {
    const res = await window.app.automationsList()
    if (!res.ok || !res.automations) {
      setError(res.error ?? 'Could not load automations.')
      return
    }
    setAutomations(res.automations)
    setError('')
  }, [])

  useEffect(() => {
    let live = true
    setLoading(true)
    void load().finally(() => { if (live) setLoading(false) })
    const off = window.app.onScheduleChanged(() => { void load() })
    return () => {
      live = false
      off()
    }
  }, [load])

  useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty, onDirtyChange])

  useEffect(() => {
    if (!focusAutomationId) return
    // Only a real automation opens the detail: a stale route id leaves the list.
    if (!automations.some((automation) => automation.id === focusAutomationId)) return
    onSelect(focusAutomationId)
  }, [automations, focusAutomationId, onSelect])

  const selected = automations.find((automation) => automation.id === selectedId) ?? null
  const visible = onlyActive ? automations.filter((automation) => automation.status === 'active') : automations

  function replace(automation: Automation): void {
    setAutomations((list) => list.map((item) => (item.id === automation.id ? automation : item)))
  }

  const actions = useMemo<AutomationActions>(() => ({
    toggle: (automation: Automation) => {
      void (async () => {
        const resume = automation.status === 'paused'
        // Optimistic: the dot flips before the round trip answers.
        replace({ ...automation, status: resume ? 'active' : 'paused' })
        const res = resume
          ? await window.app.automationsResume(automation.id)
          : await window.app.automationsPause(automation.id)
        if (!res.ok || !res.automation) {
          replace(automation)
          push({ message: res.error ?? 'Could not update the automation.', tone: 'error' })
          return
        }
        replace(res.automation)
        push({ message: resume ? 'Automation resumed.' : 'Automation paused.' })
      })()
    },
    testRun: (automation: Automation) => {
      void (async () => {
        const res = await window.app.automationsTestRun(automation.id)
        if (!res.ok) {
          push({ message: res.error ?? 'Could not start the test run.', tone: 'error' })
          return
        }
        push({
          message: 'Test run started.',
          action: { label: 'View run', onAction: () => onOpenRun(res.runId ?? '') }
        })
      })()
    },
    editSchedule: (automation: Automation) => {
      onSelect(automation.id)
      setFocusSchedule((value) => value + 1)
    },
    remove: (automation: Automation) => {
      void (async () => {
        const res = await window.app.automationsDelete(automation.id)
        if (!res.ok) {
          push({ message: res.error ?? 'Could not delete the automation.', tone: 'error' })
          return
        }
        setAutomations((list) => list.filter((item) => item.id !== automation.id))
        if (selectedId === automation.id) onSelect('')
        push({ message: 'Automation deleted.' })
      })()
    }
  }), [onOpenRun, onSelect, push, selectedId])

  function leaveDetail(): void {
    if (dirty) {
      setLeaving(true)
      return
    }
    onSelect('')
  }

  return (
    <AutomationActionsProvider value={actions}>
      {loading && <p className="st-note">Loading automations…</p>}
      {error && <p className="st-error" role="alert">{error}</p>}
      {!loading && !error && selected && (
        <AutomationDetail
          automation={selected}
          focusSchedule={focusSchedule}
          onBack={leaveDetail}
          onSaved={replace}
          onToast={(message) => push({ message })}
          onOpenRun={onOpenRun}
          onDirtyChange={setDirty}
        />
      )}
      {!loading && !error && !selected && (
        <>
          {visible.length === 0 ? (
            <div className="st-empty">
              <p>No scheduled tasks yet.</p>
              <button type="button" className="st-primary" onClick={onCreate}>Create automation</button>
            </div>
          ) : (
            <div className="st-grid">
              {visible.map((automation) => (
                <AutomationCard
                  key={automation.id}
                  automation={automation}
                  onOpen={() => onSelect(automation.id)}
                />
              ))}
            </div>
          )}
        </>
      )}
      {leaving && (
        <ConfirmDialog
          title="Leave without saving?"
          body="This automation has unsaved changes."
          confirmLabel="Leave"
          onCancel={() => setLeaving(false)}
          onConfirm={() => {
            setLeaving(false)
            setDirty(false)
            onSelect('')
          }}
        />
      )}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </AutomationActionsProvider>
  )
}
