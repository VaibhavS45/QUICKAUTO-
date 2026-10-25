import { describe, expect, it } from 'vitest'
import { readCanvasMemory, writeCanvasMemory } from '../../src/renderer/features/automations/canvas-memory.js'

function store(seed: Record<string, string> = {}): { getItem(k: string): string | null; setItem(k: string, v: string): void } {
  const map = new Map(Object.entries(seed))
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) }
}

describe('canvas memory', () => {
  it('round-trips the last canvas and the resume flag', () => {
    const storage = store()
    writeCanvasMemory({ lastId: 'a-1', resume: true }, storage)
    expect(readCanvasMemory(storage)).toEqual({ lastId: 'a-1', resume: true })
  })

  it('reads an empty store as no memory', () => {
    expect(readCanvasMemory(store())).toEqual({ lastId: '', resume: false })
    expect(readCanvasMemory()).toEqual({ lastId: '', resume: false })
  })

  it('survives a broken store', () => {
    expect(readCanvasMemory(store({ 'palette.canvas.memory': '{not json' }))).toEqual({ lastId: '', resume: false })
    expect(() => writeCanvasMemory({ lastId: 'a-1', resume: false }, { setItem: () => { throw new Error('quota') } })).not.toThrow()
  })
})
