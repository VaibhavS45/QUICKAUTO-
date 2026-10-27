import { describe, expect, it } from 'vitest'
import type { Automation } from '../../src/shared/contracts/automations.js'
import {
  NODE_H,
  NODE_W,
  blankStep,
  branchLabel,
  canvasStepsForRoutine,
  canvasToCreate,
  canvasToPatch,
  canvasToPrompt,
  compileCanvasToSchedulerText,
  defaultCanvasSteps,
  describeRoutine,
  directionPos,
  edgePath,
  edgeSourceIndex,
  insertCanvasStep,
  insertFromDirection,
  layoutPos,
  moveCanvasStep,
  moveStepTo,
  removeCanvasStep,
  scheduleFromSteps,
  tidyCanvasSteps,
  updateCanvasStep
} from '../../src/renderer/features/automations/canvas/canvas-steps.js'

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

  it('compiles canvas steps into scheduler-compatible routine text', () => {
    const steps = defaultCanvasSteps()
    const text = compileCanvasToSchedulerText(steps, 'Morning Briefing')
    expect(text).toContain('Morning Briefing')
    expect(text).toContain('at 9:00am')
    expect(text).toContain('@gmail')
  })

  it('branches steps off any side, wiring conditions with Yes/No labels', () => {
    let steps = defaultCanvasSteps()
    steps = updateCanvasStep(steps, steps[1]!.id, { kind: 'filter', title: 'Filter' })
    const filter = steps[1]!
    expect(branchLabel(filter, 'right')).toBe('Yes')
    expect(branchLabel(filter, 'down')).toBe('No')
    expect(branchLabel(filter, 'left')).toBeUndefined()

    const yes = insertFromDirection(steps, filter.id, 'right', 'gmail', { title: 'Gmail', subtitle: 'send it' })
    const yesStep = yes[2]!
    expect(yesStep.branch).toBe('Yes')
    expect(yesStep.from).toBe(filter.id)
    expect(yesStep.pos).toEqual(directionPos(filter, 'right'))

    const no = insertFromDirection(yes, filter.id, 'down', 'action', { title: 'Action', subtitle: 'skip it' })
    const noStep = no[2]!
    expect(noStep.branch).toBe('No')
    expect(edgeSourceIndex(no, 2)).toBe(1)
    expect(edgeSourceIndex(no, 0)).toBe(-1)

    // Both branches point back at the condition; the chain still reads in order.
    expect(no.find((s) => s.id === yesStep.id)?.from).toBe(filter.id)

    // A vertical edge leaves the bottom of the condition, not its right side.
    const down = edgePath(filter.pos, noStep.pos)
    expect(down).toMatch(/^M \d+ \d+ C /)
    expect(down.startsWith(`M ${filter.pos.x + NODE_W / 2} `)).toBe(true)
  })

  it('reparents children when their step is deleted', () => {
    const steps = defaultCanvasSteps()
    const child = insertFromDirection(steps, steps[1]!.id, 'right', 'action', { title: 'Action', subtitle: 'child' })
    const removed = removeCanvasStep(child, steps[1]!.id)
    expect(removed).toHaveLength(child.length - 1)
    const orphan = removed.find((s) => s.title === 'Action' && s.subtitle === 'child')!
    expect(orphan.from).toBeUndefined()
    expect(edgeSourceIndex(removed, removed.indexOf(orphan))).toBe(0)
  })

  it('round-trips a reopened canvas without truncating its prompt', () => {
    const prompt = 'Summarize every unread mail, group it by sender and list the action I owe each sender today'
    const automation: Automation = {
      id: 'a-long',
      kind: 'advanced',
      title: 'Mail digest',
      prompt,
      status: 'active',
      schedule: { type: 'daily', time: '09:00' },
      autoApprove: false,
      runMode: 'separate_task',
      agent: '',
      connectors: ['gmail'],
      createdAt: new Date().toISOString()
    }
    const steps = canvasStepsForRoutine({ prompt, tools: ['gmail'], runAt: Date.now(), repeat: 'daily' })
    expect(steps[1]?.subtitle).toBe(prompt)
    // Only a node move: nothing the stored automation does not already have.
    const patch = canvasToPatch(moveStepTo(steps, steps[1]!.id, 320, 320), automation)
    expect(patch.prompt).toBeUndefined()
    expect(patch.connectors).toBeUndefined()
  })

  it('creates a Manage automation from the chain, keeping the trigger time', () => {    const base = defaultCanvasSteps()
    const steps = updateCanvasStep(base, base[0]!.id, { subtitle: 'weekly · 6:30 pm' })
    const input = canvasToCreate(steps, 'Morning briefing', new Date(2026, 9, 25, 8, 0))
    expect(input.kind).toBe('advanced')
    expect(input.title).toBe('Morning briefing')
    expect(input.schedule).toEqual({ type: 'weekly', time: '18:30', weekdays: [0] })
    // Placeholders never leak into the stored prompt.
    expect(input.prompt).not.toMatch(/select the/i)
    const monthly = scheduleFromSteps(
      updateCanvasStep(base, base[0]!.id, { subtitle: 'monthly · 9:00 am' }),
      new Date(2026, 9, 25)
    )
    expect(monthly).toEqual({ type: 'monthly', time: '09:00', dayOfMonth: 25 })
    expect(canvasToCreate(steps, '  ').title).toBe('New automation')
  })

  it('compiles multi-step workflows with event triggers, conditions and tools', () => {
    const steps = [
      {
        id: 't1',
        kind: 'trigger' as const,
        title: 'Gmail',
        subtitle: 'When a new email is received (contains=\'invoice\') · daily · 09:00 AM',
        filled: true,
        pos: { x: 0, y: 0 },
        event: 'a new email is received',
        config: { contains: 'invoice', labelIds: 'INBOX' }
      },
      {
        id: 'f1',
        kind: 'filter' as const,
        title: 'Filter',
        subtitle: 'email amount is over $100',
        filled: true,
        pos: { x: 272, y: 0 }
      },
      {
        id: 'a1',
        kind: 'action' as const,
        title: 'Slack',
        subtitle: 'Post alert to #finance channel',
        filled: true,
        pos: { x: 544, y: 0 }
      },
      {
        id: 'a2',
        kind: 'action' as const,
        title: 'Sheets',
        subtitle: 'Append row to Invoices tab',
        filled: true,
        pos: { x: 816, y: 0 }
      }
    ]

    const { text, tools } = canvasToPrompt(steps)
    expect(text).toContain('check @gmail for a new email is received with config contains="invoice", labelIds="INBOX"')
    expect(text).toContain('Only continue if: email amount is over $100')
    expect(text).toContain('Post alert to #finance channel')
    expect(text).toContain('Append row to Invoices tab')
    expect(tools).toContain('gmail')
    expect(tools).toContain('composio')
    expect(tools).toContain('sheets')

    const createPayload = canvasToCreate(steps, 'Invoice Processor')
    expect(createPayload.kind).toBe('advanced')
    expect(createPayload.connectors).toContain('gmail')
    expect(createPayload.connectors).toContain('composio')
    expect(createPayload.connectors).toContain('sheets')
    expect(createPayload.schedule?.type).toBe('daily')
    expect(createPayload.schedule?.time).toBe('09:00')
  })
})
