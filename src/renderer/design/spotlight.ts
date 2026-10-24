/**
 * Cursor spotlight — sets --mx/--my on the card nearest the pointer so the
 * CSS radial spotlight in theme-ember.css follows the cursor. Additive and
 * inert under prefers-reduced-motion. No framework wiring needed.
 */

const AUTO_TARGETS = [
  '.automations-card',
  '.st-card',
  '.updates-row',
  '.start-opt',
  '.set-panel',
  '.shell-panel'
]

let installed = false

function reducedMotion(): boolean {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Tag cards and follow the pointer with --mx/--my. Safe to call twice. */
export function initSpotlight(root?: ParentNode, selectors: string[] = AUTO_TARGETS): void {
  if (installed || typeof document === 'undefined' || !root) return
  const reduce = reducedMotion()
  const selector = selectors.join(',')
  const targets = Array.from(root.querySelectorAll<HTMLElement>(selector))
  if (reduce) return
  for (const el of targets) el.classList.add('sp-spot')

  let pending: { x: number; y: number } | null = null
  let frame = 0

  function paint(): void {
    frame = 0
    const point = pending
    pending = null
    if (!point) return
    for (const el of targets) {
      const rect = el.getBoundingClientRect()
      if (point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom) {
        el.style.setProperty('--mx', `${Math.round(point.x - rect.left)}px`)
        el.style.setProperty('--my', `${Math.round(point.y - rect.top)}px`)
      }
    }
  }

  document.addEventListener('pointermove', (event: PointerEvent) => {
    pending = { x: event.clientX, y: event.clientY }
    if (!frame) frame = requestAnimationFrame(paint)
  }, { passive: true })
  installed = true
}
