import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  RunDetailPage,
  UpdatesList,
  dayHeading,
  groupByDay,
  matchesFilter,
  statusLabel,
  statusTone
} from '../../src/renderer/features/automations/updates-ui.js'
import type { RunRecord } from '../../src/shared/contracts/schedule.js'

const at = (d: number, h: number, m = 0): number => new Date(2026, 9, d, h, m).getTime()
const runs = [
  { id: 'a', title: 'hello', startedAt: at(11, 20, 24), status: 'succeeded', summary: 'Hello. How can I help?' },
  { id: 'b', title: 'helllo', startedAt: at(11, 20, 6), status: 'failed' },
  { id: 'c', title: 'what is', startedAt: at(10, 19, 6), status: 'succeeded' }
] as unknown as RunRecord[]

describe('run helpers', () => {
  it('maps statuses to filters, tones and labels', () => {
    expect(matchesFilter('skipped_budget', 'skipped')).toBe(true)
    expect(matchesFilter('failed', 'succeeded')).toBe(false)
    expect(statusTone('succeeded')).toBe('ok')
    expect(statusTone('failed')).toBe('bad')
    expect(statusTone('running')).toBe('live')
    expect(statusLabel('skipped_budget')).toBe('Skipped')
  })

  it('groups newest day first with an upper-case heading', () => {
    const groups = groupByDay(runs)
    expect(groups.map((g) => g.runs.length)).toEqual([2, 1])
    expect(dayHeading('2026-10-11')).toBe(dayHeading('2026-10-11').toUpperCase())
  })
})

describe('UpdatesList (activity feed)', () => {
  it('renders title, filters, day divider and an expanded first card', () => {
    const html = renderToStaticMarkup(createElement(UpdatesList, { runs }))
    expect(html).toContain('Updates')
    expect(html).toContain('Every run, newest first.')
    for (const label of ['All', 'Running', 'Succeeded', 'Failed', 'Skipped', 'Missed']) expect(html).toContain(`>${label}<`)
    expect(html).toContain('2 RUNS')
    expect(html).toContain('Hello. How can I help?')
    expect(html).toContain('aria-expanded="true"')
  })

  it('shows the empty message with no runs', () => {
    expect(renderToStaticMarkup(createElement(UpdatesList, { runs: [] }))).toContain('No outputs yet.')
  })

  it('offers an Open action in the expanded card to reach run detail', () => {
    const html = renderToStaticMarkup(createElement(UpdatesList, { runs, onSelect: () => {} }))
    expect(html).toContain('aria-expanded="true"')
    expect(html).toContain('Open</button>')
  })
})

describe('RunDetailPage (master / detail)', () => {
  const render = (run: RunRecord): string =>
    renderToStaticMarkup(createElement(RunDetailPage, { run, runs, onSelect: () => {}, onBack: () => {} }))

  it('lists every run in the rail and marks the open one', () => {
    const html = render(runs[0]!)
    expect(html).toContain('aria-label="All runs"')
    expect(html).toContain('<span class="run-count">3</span>')
    expect(html.match(/class="run-row /g)).toHaveLength(3)
    expect(html).toContain('is-active')
    expect(html).toContain('1 of 3')
    expect(html).toContain('Hello. How can I help?')
  })

  it('shows the empty-output state', () => {
    const html = render(runs[1]!)
    expect(html).toContain('No output recorded yet.')
    expect(html).toContain('This run finished without returning any text.')
    expect(html).toContain('Run again')
    expect(html).toContain('View all runs')
  })
})
