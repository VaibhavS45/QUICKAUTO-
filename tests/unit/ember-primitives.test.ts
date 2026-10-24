import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { EmptyState, PageHeader, StatusBadge, statusToken } from '../../src/renderer/components/ui/primitives.js'

describe('ember primitives', () => {
  it('maps run status to the ember token family', () => {
    expect(statusToken('running')).toBe('var(--ember)')
    expect(statusToken('succeeded')).toBe('var(--ash-1)')
    expect(statusToken('failed')).toBe('var(--danger)')
    expect(statusToken('active')).toBe('var(--ember)')
    expect(statusToken('missed')).toBe('var(--ember-deep)')
    expect(statusToken('paused'), 'cold statuses share ash-3').toBe('var(--ash-3)')
    expect(statusToken('unknown-thing')).toBe('var(--ash-3)')
  })

  it('renders status badges with heat modifiers and a check for success', () => {
    expect(renderToStaticMarkup(createElement(StatusBadge, { status: 'running' })))
      .toContain('p-status--running')
    expect(renderToStaticMarkup(createElement(StatusBadge, { status: 'succeeded' })))
      .toContain('p-status-check')
    expect(renderToStaticMarkup(createElement(StatusBadge, { status: 'paused', label: 'Hold' })))
      .toContain('Hold')
  })

  it('renders empty states and page headers additively', () => {
    const empty = renderToStaticMarkup(createElement(EmptyState, { title: 'No heat', body: 'Cold.' }))
    expect(empty).toContain('p-empty-title')
    expect(empty).toContain('Cold.')
    const head = renderToStaticMarkup(createElement(PageHeader, { title: 'Runs', kicker: 'Updates' }))
    expect(head).toContain('p-page-head-title')
    expect(head).toContain('Runs')
  })
})
