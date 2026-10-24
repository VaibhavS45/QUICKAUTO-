import { describe, expect, it } from 'vitest'
import { ACTION_PICKS, LOGIC_PICKS, TRIGGER_PICKS, filterPicks } from '../../src/renderer/features/automations/canvas-picker.js'
import { defaultCanvasSteps, insertCanvasStep } from '../../src/renderer/features/automations/canvas-steps.js'

describe('canvas step picker', () => {
  it('offers a schedule plus app triggers, and the tool actions', () => {
    expect(TRIGGER_PICKS[0]?.label).toBe('Schedule')
    expect(TRIGGER_PICKS.length).toBeGreaterThan(3)
    expect(ACTION_PICKS.map((p) => p.id)).toContain('gmail')
    expect(LOGIC_PICKS.map((p) => p.id)).toEqual(['agent', 'filter', 'delay'])
  })

  it('searches labels and hints, ignoring case', () => {
    expect(filterPicks(ACTION_PICKS, 'GMAIL').map((p) => p.id)).toEqual(['gmail'])
    expect(filterPicks(ACTION_PICKS, '  ')).toHaveLength(ACTION_PICKS.length)
    expect(filterPicks(TRIGGER_PICKS, 'zzz nothing')).toHaveLength(0)
  })

  it('inserts a picked step with its title and placeholder event', () => {
    const pick = LOGIC_PICKS.find((p) => p.id === 'agent')!
    const steps = insertCanvasStep(defaultCanvasSteps(), 2, pick.kind, undefined, { title: pick.title, subtitle: pick.subtitle })
    expect(steps[2]?.title).toBe(pick.title)
    expect(steps[2]?.subtitle).toBe(pick.subtitle)
    expect(steps).toHaveLength(5)
  })
})
