import { describe, expect, it } from 'vitest'
import { readCanvasMemory, writeCanvasMemory } from '../../src/renderer/features/automations/canvas-memory.js'

function store(initial?: string) {
  let value = initial ?? null
  return {
    read: () => value,
    getItem: () => value,
    setItem: (_key: string, next: string) => { value = next }
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
})
