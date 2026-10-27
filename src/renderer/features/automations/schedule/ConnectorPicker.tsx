import { ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toolDisplayLabel } from '../../../shell/template-requirements.js'

/** Multi-select of connected apps. Shared by the create form and the detail page. */
export function ConnectorPicker({ options, selected, onChange }: {
  options: string[]
  selected: string[]
  onChange(next: string[]): void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as HTMLElement | null
      if (target && wrapRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  const summary = selected.length === 0
    ? 'None'
    : selected.length === 1
      ? toolDisplayLabel(selected[0] ?? '')
      : `${selected.length} apps`

  return (
    <div className="st-multi" ref={wrapRef}>
      <button
        type="button"
        className="st-select"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Connectors"
        onClick={() => setOpen((value) => !value)}
      >
        <span>{summary}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div className="st-multi-panel" role="listbox" aria-multiselectable="true" aria-label="Connectors">
          {options.length === 0 && <p className="st-multi-empty">No connected apps yet.</p>}
          {options.map((option) => (
            <label key={option} className="st-multi-item">
              <input
                type="checkbox"
                checked={selected.includes(option)}
                onChange={() => onChange(
                  selected.includes(option)
                    ? selected.filter((item) => item !== option)
                    : [...selected, option]
                )}
              />
              {toolDisplayLabel(option)}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
