import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

export interface BreadcrumbItem {
  label: string
  /** Parent segments navigate back. The current page (last item) has none. */
  onClick?(): void
}

type TrailSetter = (items: BreadcrumbItem[]) => void

const SetTrailContext = createContext<TrailSetter | null>(null)
const TrailContext = createContext<BreadcrumbItem[]>([])

/**
 * The one breadcrumb of the app. Pages declare the trail of the screen they
 * show; the app shell renders it once, in the top bar at the far left.
 *
 * ponytail: the trail lives in a context, not in the route, because the open
 * automation is page state (the route only knows which tab is active).
 */
export function useBreadcrumbs(items: BreadcrumbItem[]): void {
  const set = useContext(SetTrailContext)
  const latest = useRef(items)
  latest.current = items
  // Labels drive the trail: same labels, same trail, no re-render churn.
  const key = items.map((item) => item.label).join('\u0000')
  useEffect(() => {
    if (!set) return
    set(latest.current)
    return () => set([])
  }, [key, set])
}

export function BreadcrumbProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [items, setItems] = useState<BreadcrumbItem[]>([])
  const set = useCallback((next: BreadcrumbItem[]) => setItems(next), [])
  return (
    <SetTrailContext.Provider value={set}>
      <TrailContext.Provider value={items}>{children}</TrailContext.Provider>
    </SetTrailContext.Provider>
  )
}

/** The trail the current page declared. */
function useTrail(): BreadcrumbItem[] {
  return useContext(TrailContext)
}

/** The shell's breadcrumb slot. It reads the trail, so it must sit inside
 *  the provider. */
export function BreadcrumbBar(): React.JSX.Element | null {
  return <Breadcrumbs items={useTrail()} />
}

/** The trail, rendered by the app shell. Empty trail: nothing at all. */
export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }): React.JSX.Element | null {
  if (items.length === 0) return null
  return (
    <nav className="shell-breadcrumbs" aria-label="Breadcrumb">
      <ol className="shell-breadcrumbs-list">
        {items.map((item, index) => {
          const last = index === items.length - 1
          return (
            <li key={`${item.label}-${index}`} className="shell-breadcrumbs-item">
              {last ? (
                <span className="shell-breadcrumbs-current" aria-current="page" title={item.label}>{item.label}</span>
              ) : (
                <button type="button" className="shell-breadcrumbs-parent" onClick={item.onClick}>{item.label}</button>
              )}
              {last ? null : <span className="shell-breadcrumbs-sep" aria-hidden="true">/</span>}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
