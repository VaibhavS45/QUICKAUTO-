import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { createFeatureProps } from '../../src/renderer/shell/FeatureHost.js'
import { RunDetailPage } from '../../src/renderer/features/automations/AutomationsView.js'
import type { ShellApi } from '../../src/renderer/contracts/feature.js'
import type { RunRecord } from '../../src/shared/contracts/schedule.js'

const shell: ShellApi = {
  navigate: () => {},
  openCalendarWindow: () => {},
  openSettings: () => {},
  notify: () => {}
}

const runs = [
  { id: 'run-1', routineId: 'a1', title: 'nightly sync', kind: 'routine', status: 'done', startedAt: 1000, endedAt: 2000, summary: 'Synced 12 rows.' },
  { id: 'run-2', routineId: 'a1', title: 'nightly sync', kind: 'routine', status: 'failed', startedAt: 3000, endedAt: 4000, summary: 'Timed out.' }
] as unknown as RunRecord[]

describe('run detail plumbing', () => {
  it('passes focusRunId through to the feature', () => {
    const props = createFeatureProps(shell, { focusRunId: 'run-1' })
    expect(props.focusRunId).toBe('run-1')
  })

  it('ignores non-string focusRunId', () => {
    expect(createFeatureProps(shell, { focusRunId: 7 }).focusRunId).toBe(undefined)
  })
})

describe('RunDetailPage', () => {
  it('shows the run info with every run in the right rail', () => {
    const html = renderToStaticMarkup(
      createElement(RunDetailPage, { run: runs[0], runs, onSelect: () => {}, onBack: () => {} })
    )
    expect(html).toContain('Synced 12 rows.')
    expect(html).toContain('All runs')
    expect(html).toContain('Runs <small>(2)</small>')
    expect(html.match(/automations-day-item/g)).toHaveLength(2)
    expect(html).toContain('automations-dot is-failed')
    expect(html).toContain('is-active')
    expect(html).toContain('← Back')
  })

  it('switches runs through onSelect', () => {
    const onSelect = vi.fn()
    const html = renderToStaticMarkup(
      createElement(RunDetailPage, { run: runs[0], runs, onSelect, onBack: () => {} })
    )
    expect(html).toContain('Synced 12 rows.')
    onSelect(runs[1])
    expect(onSelect).toHaveBeenCalledWith(runs[1])
  })
})
