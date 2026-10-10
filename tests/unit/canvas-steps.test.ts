import { describe, expect, it } from 'vitest'
import {
  NODE_H,
  NODE_W,
  blankStep,
  canvasStepsForRoutine,
  canvasToPrompt,
  defaultCanvasSteps,
  describeRoutine,
  edgePath,
  insertCanvasStep,
  layoutPos,
  moveCanvasStep,
  moveStepTo,
  removeCanvasStep,
  tidyCanvasSteps,
  updateCanvasStep
} from '../../src/renderer/features/automations/canvas-steps.js'

describe('canvas steps', () => {
  it('builds the blank Zap-style starter chain', () => {
    const steps = defaultCanvasSteps()
    expect(steps.map((s) => s.title)).toEqual(['Trigger', 'Action', 'Gmail', 'Action'])
    expect(steps[2]?.filled).toBe(true)
  })

  it('derives steps from a routine with tool apps', () => {
    const steps = canvasStepsForRoutine({ prompt: 'Email report', tools: ['gmail', 'sheets'], runAt: Date.now(), repeat: 'daily' })
    expect(steps[0]?.kind).toBe('trigger')
    expect(steps.map((s) => s.title)).toContain('Gmail')
    expect(steps.map((s) => s.title)).toContain('Sheets')
  })

  it('inserts, moves, updates and removes steps', () => {
    let steps = defaultCanvasSteps()
    steps = insertCanvasStep(steps, 1, 'filter')
    expect(steps[1]?.kind).toBe('filter')
    expect(steps).toHaveLength(5)
    const id = steps[1]!.id
    steps = updateCanvasStep(steps, id, { subtitle: 'Only if amount > 100' })
    expect(steps[1]?.subtitle).toContain('amount')
    steps = moveCanvasStep(steps, id, 1)
    expect(steps[2]?.id).toBe(id)
    steps = removeCanvasStep(steps, id)
    expect(steps).toHaveLength(4)
  })

  it('lays nodes left-to-right and wires them with bezier edges', () => {
    const steps = defaultCanvasSteps()
    expect(steps[1]!.pos.x).toBe(steps[0]!.pos.x + 272)
    expect(steps.map((s) => s.pos.y)).toEqual([layoutPos(0).y, layoutPos(0).y, layoutPos(0).y, layoutPos(0).y])
    const d = edgePath(steps[0]!.pos, steps[1]!.pos)
    expect(d).toMatch(/^M \d+ \d+ C /)
    // Inserted node takes the slot; later nodes slide right so nothing overlaps.
    const withFilter = insertCanvasStep(steps, 1, 'filter')
    expect(withFilter).toHaveLength(5)
    expect(withFilter[1]!.kind).toBe('filter')
    expect(withFilter[1]!.filled).toBe(false)
    expect(withFilter[1]!.pos.x).toBe(steps[0]!.pos.x + 272)
    expect(withFilter[2]!.pos.x).toBe(steps[1]!.pos.x + 272)
  })

  it('tidies a messy layout back into a left-to-right chain', () => {
    const messy = moveStepTo(defaultCanvasSteps(), defaultCanvasSteps()[0]!.id, 900, 500)
    const tidied = tidyCanvasSteps(messy)
    tidied.forEach((s, i) => expect(s.pos).toEqual(layoutPos(i)))
  })

  it('inserts at an explicit position for double-click placement', () => {
    const steps = defaultCanvasSteps()
    const at = insertCanvasStep(steps, steps.length, 'action', { x: 900, y: 120 })
    expect(at[at.length - 1]!.pos).toEqual({ x: 900, y: 120 })
  })

  it('free-drags nodes with clamping', () => {
    const steps = defaultCanvasSteps()
    const id = steps[0]!.id
    const moved = moveStepTo(steps, id, 500, 300)
    expect(moved[0]!.pos).toEqual({ x: 500, y: 300 })
    const clamped = moveStepTo(steps, id, -99, 9999)
    expect(clamped[0]!.pos.x).toBe(0)
    expect(clamped[0]!.pos.y).toBeLessThanOrEqual(640 - NODE_H)
    expect(clamped[0]!.pos.x + NODE_W).toBeLessThanOrEqual(2400)
  })
  it('composes a prompt with @tool mentions and describes advanced routines', () => {
    const steps = canvasStepsForRoutine({ prompt: 'Send report', tools: ['gmail'], runAt: Date.now(), repeat: 'daily' })
    const { text, tools } = canvasToPrompt(steps)
    expect(tools).toContain('gmail')
    expect(text).toContain('@gmail')
    expect(describeRoutine({ prompt: 'x', tools: ['gmail', 'sheets'], runAt: Date.now(), repeat: 'daily' })).toMatch(/^Advanced/)
    expect(describeRoutine({ prompt: 'x', tools: ['gmail'], runAt: Date.now(), repeat: 'once' })).toMatch(/^Simple/)
    expect(blankStep('delay').title).toBe('Delay')
  })
})
