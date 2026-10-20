import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Breadcrumb, BreadcrumbItem, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from '../../src/renderer/components/ui/breadcrumb.js'

describe('breadcrumb', () => {
  it('renders the trail with a chevron separator and the current page', () => {
    const html = renderToStaticMarkup(createElement(
      Breadcrumb,
      { className: 'automations-crumbbar' },
      createElement(
        BreadcrumbList,
        null,
        createElement(BreadcrumbItem, null, 'Schedule automation'),
        createElement(BreadcrumbSeparator, null),
        createElement(BreadcrumbItem, null, createElement(BreadcrumbPage, null, 'Inbox digest'))
      )
    ))
    expect(html).toContain('aria-label="breadcrumb"')
    expect(html).toContain('automations-crumbbar')
    expect(html).toContain('Schedule automation')
    expect(html).toContain('aria-current="page"')
    expect(html).toContain('lucide-chevron-right')
  })

  it('keeps crumbs as plain text, not buttons', () => {
    const html = renderToStaticMarkup(createElement(
      Breadcrumb,
      null,
      createElement(BreadcrumbList, null, createElement(BreadcrumbItem, null, 'Schedule automation'))
    ))
    expect(html).not.toContain('<button')
  })
})
