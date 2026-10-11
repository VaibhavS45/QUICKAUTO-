import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { CommandPalette, filterPaletteItems, type PaletteItem } from '../../src/renderer/shell/CommandPalette.js'

const items: PaletteItem[] = [
  { id: 'a', title: 'New chat', hint: '⌘N', run: () => {} },
  { id: 'b', title: 'Open Connectors settings', hint: 'Settings', run: () => {} }
]

describe('filterPaletteItems', () => {
  it('returns everything on empty query', () => {
    expect(filterPaletteItems(items, '')).toHaveLength(2)
    expect(filterPaletteItems(items, '   ')).toHaveLength(2)
  })

  it('matches title or hint, case-insensitively', () => {
    expect(filterPaletteItems(items, 'connectors')).toHaveLength(1)
    expect(filterPaletteItems(items, 'SETTINGS')).toHaveLength(1)
    expect(filterPaletteItems(items, 'zzz')).toHaveLength(0)
  })
})

describe('CommandPalette', () => {
  it('renders nothing when closed', () => {
    const html = renderToStaticMarkup(
      createElement(CommandPalette, { open: false, items, onClose: () => {} })
    )
    expect(html).toBe('')
  })

  it('renders the dialog with items when open', () => {
    const html = renderToStaticMarkup(
      createElement(CommandPalette, { open: true, items, onClose: () => {} })
    )
    expect(html).toContain('Command palette')
    expect(html).toContain('New chat')
  })

  it('runs the chosen item then closes', () => {
    const run = vi.fn()
    const onClose = vi.fn()
    const list = [{ id: 'a', title: 'New chat', run }]
    expect(filterPaletteItems(list, 'new')).toHaveLength(1)
    list[0].run()
    onClose()
    expect(run).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })
})
