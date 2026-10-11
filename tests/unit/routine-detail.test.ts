import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { ManageDetail } from '../../src/renderer/features/automations/AutomationsView.js'
import type { RunRecord } from '../../src/shared/contracts/schedule.js'

const routine = {
  id: 'r1',
  prompt: 'Summarize the inbox every morning',
  tools: ['gmail'],
  runAt: Date.now(),
  repeat: 'daily',
  enabled: true,
  lastStatus: 'done'
}

const runs = [
  { id: 'run-1', routineId: 'r1', title: 'Summarize the inbox', kind: 'routine', status: 'done', startedAt: 1000, endedAt: 2000, summary: 'Did it.' }
] as unknown as RunRecord[]

describe('ManageDetail page content', () => {
  it('shows details sections with history wiring', () => {
    const html = renderToStaticMarkup(
      createElement(ManageDetail, {
        routine,
        runs,
        onToggle: () => {},
        onRemove: () => {},
        onSelectRun: () => {}
      })
    )
    expect(html).toContain('The agent will')
    expect(html).toContain('Advanced settings')
    expect(html).toContain('History')
  })

  it('forwards history run clicks', () => {
    const onSelectRun = vi.fn()
    renderToStaticMarkup(
      createElement(ManageDetail, { routine, runs, onToggle: () => {}, onRemove: () => {}, onSelectRun })
    )
    onSelectRun(runs[0])
    expect(onSelectRun).toHaveBeenCalledWith(runs[0])
  })
})
