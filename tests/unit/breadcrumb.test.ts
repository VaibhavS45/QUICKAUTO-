import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Breadcrumbs } from '../../src/renderer/components/layout/Breadcrumbs.js'

describe('global breadcrumb', () => {
  it('renders the trail with a "/" separator and the current page marked', () => {
    const html = renderToStaticMarkup(createElement(Breadcrumbs, {
      items: [{ label: 'Automations' }, { label: 'Say hello' }]
    }))
    expect(html).toContain('aria-label="Breadcrumb"')
    expect(html).toContain('Automations')
    expect(html).toContain('Say hello')
    expect(html).toContain('/')
    expect(html).toContain('aria-current="page"')
  })

  it('keeps the last item as plain text and the parents as buttons', () => {
    const html = renderToStaticMarkup(createElement(Breadcrumbs, {
      items: [{ label: 'Automations', onClick: () => {} }, { label: 'Say hello' }]
    }))
    expect(html).toContain('<button')
    expect(html).toMatch(/aria-current="page"[^>]*>Say hello</)
    expect(html).not.toMatch(/aria-current="page"[^>]*>Automations</)
  })

  it('renders nothing without a trail', () => {
    const html = renderToStaticMarkup(createElement(Breadcrumbs, { items: [] }))
    expect(html).not.toContain('aria-label="Breadcrumb"')
  })
})
