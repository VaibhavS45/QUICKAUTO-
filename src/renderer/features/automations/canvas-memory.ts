export interface CanvasMemory {
  /** The canvas opened last, so the tab can resume it. */
  lastId: string
  /** When true the Canvas tab reopens `lastId` instead of showing the chooser. */
  resume: boolean
}

const KEY = 'palette.canvas.memory'

type ReadStorage = { getItem(key: string): string | null }
type WriteStorage = { setItem(key: string, value: string): void }

/** Read the remembered canvas; a missing or broken store reads as empty. */
export function readCanvasMemory(storage?: ReadStorage): CanvasMemory {
  try {
    const raw = storage?.getItem(KEY)
    if (!raw) return { lastId: '', resume: false }
    const parsed = JSON.parse(raw) as Partial<CanvasMemory> | null
    return {
      lastId: typeof parsed?.lastId === 'string' ? parsed.lastId : '',
      resume: parsed?.resume === true
    }
  } catch {
    return { lastId: '', resume: false }
  }
}

export function writeCanvasMemory(memory: CanvasMemory, storage?: WriteStorage): void {
  try {
    storage?.setItem(KEY, JSON.stringify({ lastId: memory.lastId, resume: memory.resume }))
  } catch {
    // A full or blocked store only loses the preference.
  }
}
