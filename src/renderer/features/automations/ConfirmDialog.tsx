import { useEffect, useRef } from 'react'

/** Small modal confirm used before deleting an automation. */
export function ConfirmDialog({
  title,
  body,
  confirmLabel = 'Delete',
  onConfirm,
  onCancel
}: {
  title: string
  body: string
  confirmLabel?: string
  onConfirm(): void
  onCancel(): void
}): React.JSX.Element {
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    confirmRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onCancel()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  return (
    <div className="st-dialog-backdrop" onPointerDown={onCancel}>
      <div
        className="st-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <h2>{title}</h2>
        <p>{body}</p>
        <div className="st-dialog-actions">
          <button type="button" onClick={onCancel}>Cancel</button>
          <button type="button" className="is-danger" ref={confirmRef} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  )
}
