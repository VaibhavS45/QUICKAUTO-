import { useCallback, useState } from 'react'

/** Small toast stack for the Scheduled Tasks surfaces. */

export interface ToastAction {
  label: string
  onAction(): void
}

export interface ToastItem {
  id: string
  message: string
  tone?: 'info' | 'error'
  action?: ToastAction
}

export function useToasts(): {
  toasts: ToastItem[]
  push(toast: Omit<ToastItem, 'id'>): void
  dismiss(id: string): void
} {
  const [toasts, setToasts] = useState<ToastItem[]>([])

  const dismiss = useCallback((id: string): void => {
    setToasts((list) => list.filter((toast) => toast.id !== id))
  }, [])

  const push = useCallback((toast: Omit<ToastItem, 'id'>): void => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    setToasts((list) => [...list, { ...toast, id }])
    setTimeout(() => dismiss(id), toast.tone === 'error' ? 6000 : 4000)
  }, [dismiss])

  return { toasts, push, dismiss }
}

export function ToastStack({ toasts, onDismiss }: {
  toasts: ToastItem[]
  onDismiss(id: string): void
}): React.JSX.Element {
  if (toasts.length === 0) return <div className="st-toasts" aria-live="polite" />
  return (
    <div className="st-toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div key={toast.id} className={`st-toast is-${toast.tone}`}>
          <span>{toast.message}</span>
          {toast.action && (
            <button
              type="button"
              onClick={() => {
                toast.action?.onAction()
                onDismiss(toast.id)
              }}
            >
              {toast.action.label}
            </button>
          )}
          <button type="button" aria-label="Dismiss" onClick={() => onDismiss(toast.id)}>×</button>
        </div>
      ))}
    </div>
  )
}
