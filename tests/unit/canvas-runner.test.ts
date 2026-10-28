import { describe, expect, it } from 'vitest'
import { runCanvasAutomation, type CanvasStepTask } from '../../src/main/automations/canvas/canvas-runner.js'
import type { CanvasStepRecord } from '../../src/shared/contracts/automations.js'

function step(id: string, kind: CanvasStepRecord['kind'], subtitle: string, from?: string, branch?: string): CanvasStepRecord {
  return {
    id,
    kind,
    title: kind === 'action' ? id : kind[0]!.toUpperCase() + kind.slice(1),
    subtitle,
    filled: true,
    pos: { x: 0, y: 0 },
    ...(from ? { from } : {}),
    ...(branch ? { branch } : {})
  }
}

describe('canvas automation runner', () => {
  it('runs connected actions separately and hands each response to the next step', async () => {
    const tasks: CanvasStepTask[] = []
    const graph = [
      step('trigger', 'trigger', 'daily · 09:00'),
      step('first', 'action', 'Find the latest report'),
      step('second', 'action', 'Summarize the report')
    ]

    const result = await runCanvasAutomation(graph, ['websearch', 'gmail'], async (task) => {
      tasks.push(task)
      return { status: 'completed', text: `result-${task.step.id}`, steps: 1 }
    })

    expect(tasks.map((task) => task.step.id)).toEqual(['first', 'second'])
    expect(tasks[0]?.tools).toEqual([])
    expect(tasks[1]?.prompt).toContain('"result-first"')
    expect(tasks[1]?.prompt).toContain('untrusted data')
    expect(result).toEqual({ status: 'completed', text: 'result-second', steps: 2 })
  })

  it('executes only the selected filter branch', async () => {
    const tasks: CanvasStepTask[] = []
    const graph = [
      step('trigger', 'trigger', 'daily · 09:00'),
      step('filter', 'filter', 'Does the report contain urgent items?'),
      step('yes', 'action', 'Send an alert', 'filter', 'Yes'),
      step('no', 'action', 'Archive the report', 'filter', 'No')
    ]

    const result = await runCanvasAutomation(graph, ['gmail'], async (task) => {
      tasks.push(task)
      return {
        status: 'completed',
        text: task.isFilter ? 'YES' : 'sent successfully',
        steps: 1
      }
    })

    expect(tasks.map((task) => task.step.id)).toEqual(['filter', 'yes'])
    expect(tasks[0]?.tools).toEqual([])
    expect(result).toEqual({ status: 'completed', text: 'sent successfully', steps: 2 })
  })

  it('fails clearly when a filter does not return a routable answer', async () => {
    const graph = [
      step('trigger', 'trigger', 'daily · 09:00'),
      step('filter', 'filter', 'Check the condition'),
      step('action', 'action', 'Continue', 'filter', 'Yes')
    ]
    const result = await runCanvasAutomation(graph, [], async () => ({
      status: 'completed',
      text: 'The condition is probably true.',
      steps: 1
    }))

    expect(result).toEqual({
      status: 'failed',
      message: 'Canvas filter "Filter" must return YES or NO.'
    })
  })

  it('rejects cyclic graphs before executing any node', async () => {
    const graph = [
      step('first', 'action', 'Run first', 'second'),
      step('second', 'action', 'Run second', 'first')
    ]
    let called = false
    const result = await runCanvasAutomation(graph, [], async () => {
      called = true
      return { status: 'completed', text: 'unexpected', steps: 1 }
    })

    expect(called).toBe(false)
    expect(result).toEqual({ status: 'failed', message: 'Canvas contains a cycle and cannot be run.' })
  })

  it('returns null for graphs without configured instructions', async () => {
    const graph = [step('trigger', 'trigger', 'Select the trigger event'), step('action', 'action', 'Select the app and event')]
    const result = await runCanvasAutomation(graph, [], async () => {
      throw new Error('Unconfigured graph should not run.')
    })

    expect(result).toBeNull()
  })
})
