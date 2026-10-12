import { useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '../i18n/LanguageContext.js'

export interface PaletteItem {
  id: string
  title: string
  hint?: string
  run(): void
}

/** Case-insensitive title/hint filter (pure, unit-tested). */
export function filterPaletteItems(items: PaletteItem[], query: string): PaletteItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return items
  return items.filter(
    (item) => item.title.toLowerCase().includes(q) || (item.hint ?? '').toLowerCase().includes(q)
  )
}

export function CommandPalette({ open, items, onClose }: {
  open: boolean
  items: PaletteItem[]
  onClose(): void
}): React.JSX.Element | null {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const results = useMemo(() => filterPaletteItems(items, query), [items, query])

  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
      inputRef.current?.focus()
    }
  }, [open ])

  if (!open) return null

  function choose(index: number): void {
    const item = results[index]
    if (!item) return
    onClose()
    item.run()
  }

  return (
    <div className="shell-palette-overlay" onClick={(event) => {
      if (event.target === event.currentTarget) onClose()
    }}>
      <div className="shell-palette" role="dialog" aria-label={t('palette.title')}>
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setQuery(event.currentTarget.value)
            setActive(0)
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setActive((i) => Math.min(i + 1, results.length - 1))
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              setActive((i) => Math.max(i - 1, 0))
            } else if (event.key === 'Enter') {
              choose(active)
            } else if (event.key === 'Escape') {
              onClose()
            }
          }}
          placeholder={t('palette.placeholder')}
          aria-label={t('palette.title')}
        />
        <div className="shell-palette-list" role="listbox" aria-label={t('palette.commands')}>
          {results.length === 0 && <p className="shell-palette-empty">{t('palette.empty')}</p>}
          {results.map((item, index) => (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={index === active}
              className={`shell-palette-item${index === active ? ' is-active' : ''}`}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(index)}
            >
              <span>{item.title}</span>
              {item.hint && <small>{item.hint}</small>}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
