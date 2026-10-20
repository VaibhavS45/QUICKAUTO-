import { MoreHorizontal, Pause, Pencil, Play, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { Automation } from '../../../shared/contracts/automations.js'
import { useAutomationActions } from './automation-actions.js'
import { ConfirmDialog } from './ConfirmDialog.js'

/** Clock with a play badge: "test run" without touching the schedule. */
function TestRunIcon(): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="10.5" cy="12" r="7.5" />
      <path d="M10.5 8.5V12l2.4 1.4" />
      <path d="M16.4 14.4v5.4l4.4-2.7z" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** Menu entries for an automation; Resume/Pause follow the current status. */
export function automationMenuItems(status: Automation['status']): Array<{ id: string; label: string; danger?: boolean }> {
  return [
    { id: 'toggle', label: status === 'paused' ? 'Resume' : 'Pause' },
    { id: 'test', label: 'Test run' },
    { id: 'edit', label: 'Edit schedule' },
    { id: 'delete', label: 'Delete', danger: true }
  ]
}

/**
 * Shared "⋯" menu for an automation: resume/pause, test run, edit schedule and
 * delete. Used by the card and by the detail header, so both behave the same.
 */
export function AutomationActionsMenu({ automation }: { automation: Automation }): React.JSX.Element {
  const actions = useAutomationActions()
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  const items = useMemo(() => {
    const icons: Record<string, React.ReactNode> = {
      toggle: automation.status === 'paused' ? <Play size={16} /> : <Pause size={16} />,
      test: <TestRunIcon />,
      edit: <Pencil size={16} />,
      delete: <Trash2 size={16} />
    }
    const run: Record<string, () => void> = {
      toggle: () => actions.toggle(automation),
      test: () => actions.testRun(automation),
      edit: () => actions.editSchedule(automation),
      delete: () => setConfirming(true)
    }
    return automationMenuItems(automation.status).map((item) => ({
      ...item,
      icon: icons[item.id],
      run: run[item.id] ?? (() => {})
    }))
  }, [automation, actions])

  function close(): void {
    setOpen(false)
    triggerRef.current?.focus()
  }

  function focusItem(index: number): void {
    const nodes = wrapRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
    if (!nodes || nodes.length === 0) return
    const next = (index + nodes.length) % nodes.length
    nodes[next]?.focus()
  }

  useEffect(() => {
    if (!open) return
    focusItem(0)
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        close()
        return
      }
      if (event.key === 'Tab') {
        setOpen(false)
        return
      }
      const items = wrapRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
      if (!items) return
      const current = Array.from(items).findIndex((node) => node === document.activeElement)
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        focusItem(current + 1)
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        focusItem(current - 1)
      } else if (event.key === 'Home') {
        event.preventDefault()
        focusItem(0)
      } else if (event.key === 'End') {
        event.preventDefault()
        focusItem(items.length - 1)
      }
    }
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as HTMLElement | null
      if (target && wrapRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('pointerdown', onPointerDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open])

  return (
    <div className="st-menu-wrap" ref={wrapRef}>
      <button
        type="button"
        ref={triggerRef}
        className="st-more"
        aria-label="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        title="More actions"
        onClick={(event) => {
          event.stopPropagation()
          setOpen((value) => !value)
        }}
      >
        <MoreHorizontal size={18} />
      </button>
      {open && (
        <div className="st-menu" role="menu" aria-label={`Actions for ${automation.title}`}>
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className={item.danger ? 'is-danger' : undefined}
              onClick={(event) => {
                event.stopPropagation()
                setOpen(false)
                item.run()
              }}
            >
              <span className="st-menu-icon" aria-hidden="true">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      )}
      {confirming && (
        <ConfirmDialog
          title={`Delete '${automation.title}'?`}
          body="This can't be undone."
          confirmLabel="Delete"
          onCancel={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false)
            actions.remove(automation)
          }}
        />
      )}
    </div>
  )
}
