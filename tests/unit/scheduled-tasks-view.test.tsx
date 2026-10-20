import { createElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { AutomationActionsProvider, type AutomationActions } from '../../src/renderer/features/automations/automation-actions.js'
import { automationMenuItems } from '../../src/renderer/features/automations/AutomationActionsMenu.js'
import { AutomationCard } from '../../src/renderer/features/automations/AutomationCard.js'
import { AutomationDetail } from '../../src/renderer/features/automations/AutomationDetail.js'
import type { Automation } from '../../src/shared/contracts/automations.js'

vi.stubGlobal('window', {})

const actions: AutomationActions = {
  toggle: () => {},
  testRun: () => {},
  editSchedule: () => {},
  remove: () => {}
}

function render(node: ReactNode): string {
  return renderToStaticMarkup(createElement(AutomationActionsProvider, { value: actions }, node))
}

function automation(over: Partial<Automation> = {}): Automation {
  return {
    id: 'a1',
    kind: 'schedule',
    title: 'Say hello',
    prompt: 'say hello to the team',
    status: 'active',
    schedule: { type: 'daily', time: '10:00' },
    autoApprove: false,
    runMode: 'separate_task',
    agent: '',
    connectors: [],
    createdAt: '2026-10-07T12:00:00.000Z',
    ...over
  }
}

describe('Scheduled Task card', () => {
  it('shows the schedule meta line, the title and the prompt preview', () => {
    const html = render(createElement(AutomationCard, { automation: automation(), onOpen: () => {} }))
    expect(html).toContain('Schedule · Repeat daily at 10:00')
    expect(html).toContain('Say hello')
    expect(html).toContain('say hello to the team')
    expect(html).toContain('Active')
  })

  it('reads a one-time task as a date and a time', () => {
    const html = render(createElement(AutomationCard, {
      automation: automation({ schedule: { type: 'once', time: '21:45', date: '2026-10-11' } }),
      onOpen: () => {}
    }))
    expect(html).toContain('Oct 11, 2026 at 21:45')
  })

  it('marks an advanced automation and drops its prompt preview', () => {
    const html = render(createElement(AutomationCard, {
      automation: automation({ kind: 'advanced', title: 'Daily Hacker News Top 10 Digest', prompt: '' }),
      onOpen: () => {}
    }))
    expect(html).toContain('Advanced automation')
    expect(html).toContain('Daily Hacker News Top 10 Digest')
    expect(html).not.toContain('st-preview')
  })

  it('dims a paused card', () => {
    const html = render(createElement(AutomationCard, { automation: automation({ status: 'paused' }), onOpen: () => {} }))
    expect(html).toContain('is-paused')
    expect(html).toContain('Paused')
  })
})

describe('actions menu', () => {
  it('offers Resume for a paused automation and Pause for an active one', () => {
    expect(automationMenuItems('paused')[0]?.label).toBe('Resume')
    expect(automationMenuItems('active')[0]?.label).toBe('Pause')
  })

  it('always offers test run, edit schedule and delete', () => {
    const labels = automationMenuItems('active').map((item) => item.label)
    expect(labels).toEqual(['Pause', 'Test run', 'Edit schedule', 'Delete'])
  })

  it('renders the same trigger on the card and on the detail header', () => {
    const card = render(createElement(AutomationCard, { automation: automation(), onOpen: () => {} }))
    const detail = render(createElement(AutomationDetail, {
      automation: automation(),
      onSaved: () => {},
      onToast: () => {},
      onOpenRun: () => {},
      onDirtyChange: () => {}
    }))
    expect(card).toContain('aria-label="More actions"')
    expect(detail).toContain('aria-label="More actions"')
  })
})

describe('Scheduled Task detail page', () => {
  it('keeps the title and the prompt in separate fields', () => {
    const html = render(createElement(AutomationDetail, {
      automation: automation(),
      onSaved: () => {},
      onToast: () => {},
      onOpenRun: () => {},
      onDirtyChange: () => {}
    }))
    expect(html).toContain('id="st-title"')
    expect(html).toContain('value="Say hello"')
    expect(html).toContain('id="st-prompt"')
    expect(html).toContain('say hello to the team')
    expect(html).not.toContain('value="Say hellosay hello to the team"')
  })

  it('shows the schedule row, the approvals card and the advanced settings', () => {
    const html = render(createElement(AutomationDetail, {
      automation: automation(),
      onSaved: () => {},
      onToast: () => {},
      onOpenRun: () => {},
      onDirtyChange: () => {}
    }))
    expect(html).toContain('Schedule')
    expect(html).toContain('aria-label="Frequency"')
    expect(html).toContain('aria-label="Time"')
    expect(html).toContain('Confirmations')
    expect(html).toContain('Scheduled runs are read-only')
    expect(html).toContain('Advanced settings')
    expect(html).toContain('Details')
    expect(html).toContain('History')
  })

  it('disables the rows the app cannot offer yet', () => {
    const html = render(createElement(AutomationDetail, {
      automation: automation(),
      onSaved: () => {},
      onToast: () => {},
      onOpenRun: () => {},
      onDirtyChange: () => {}
    }))
    expect(html).toContain('aria-label="Project"')
    expect(html).toContain('aria-label="Local folder"')
    expect(html).toContain('aria-label="Cloud computer"')
  })
})
