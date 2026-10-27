import { describe, expect, it } from 'vitest'
import { readCanvasMemory, writeCanvasMemory, readCanvasSteps, writeCanvasSteps } from '../../src/renderer/features/automations/canvas/canvas-memory.js'

function store(initial?: string) {
  let value = initial ?? null
  const map = new Map<string, string>()
  if (initial) map.set('palette.canvas.memory', initial)
  return {
    read: () => value,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, next: string) => {
      value = next
      map.set(key, next)
    }
  }
}

describe('canvas memory', () => {
  it('reads an empty memory when the store is missing or blank', () => {
    expect(readCanvasMemory()).toEqual({ lastId: '', resume: false })
    expect(readCanvasMemory(store())).toEqual({ lastId: '', resume: false })
  })

  it('round-trips the last canvas and the resume choice', () => {
    const memory = store()
    writeCanvasMemory({ lastId: 'a-1', resume: true }, memory)
    expect(readCanvasMemory(memory)).toEqual({ lastId: 'a-1', resume: true })
  })

  it('ignores a broken or partial value', () => {
    expect(readCanvasMemory(store('not json'))).toEqual({ lastId: '', resume: false })
    expect(readCanvasMemory(store('{"lastId":"a-2"}'))).toEqual({ lastId: 'a-2', resume: false })
    expect(readCanvasMemory(store('{"resume":"yes"}'))).toEqual({ lastId: '', resume: false })
  })

  it('swallows storage failures', () => {
    const broken = {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') }
    }
    expect(readCanvasMemory(broken)).toEqual({ lastId: '', resume: false })
    expect(() => writeCanvasMemory({ lastId: 'a', resume: true }, broken)).not.toThrow()
  })

  it('round-trips canvas steps per automation id', () => {
    const memory = store()
    const mockSteps = [
      { id: 's1', kind: 'trigger', title: 'Schedule', subtitle: 'daily · 9:00 am', filled: true, pos: { x: 0, y: 0 } },
      { id: 's2', kind: 'action', title: 'Slack', subtitle: 'Post message', filled: true, pos: { x: 272, y: 0 } }
    ]
    expect(readCanvasSteps('auto-1', memory)).toBeNull()
    writeCanvasSteps('auto-1', mockSteps, memory)
    expect(readCanvasSteps('auto-1', memory)).toEqual(mockSteps)
    expect(readCanvasSteps('auto-2', memory)).toBeNull()
  })
})
