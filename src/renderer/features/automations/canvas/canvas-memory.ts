export interface CanvasMemory {
  /** The canvas opened last, so the tab can resume it. */
  lastId: string
  /** When true the Canvas tab reopens `lastId` instead of showing the chooser. */
  resume: boolean
}

const KEY = 'palette.canvas.memory'
const STEPS_KEY_PREFIX = 'palette.canvas.steps.'

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

/** Read the saved canvas steps for an automation ID; returns null if not stored or corrupt. */
export function readCanvasSteps<T = unknown>(id: string, storage?: ReadStorage): T[] | null {
  if (!id) return null
  try {
    const raw = storage?.getItem(STEPS_KEY_PREFIX + id)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length > 0) return parsed as T[]
    return null
  } catch {
    return null
  }
}

/** Store the canvas steps for an automation ID so reopening it restores the exact graph. */
export function writeCanvasSteps<T = unknown>(id: string, steps: T[], storage?: WriteStorage): void {
  if (!id) return
  try {
    storage?.setItem(STEPS_KEY_PREFIX + id, JSON.stringify(steps))
  } catch {
    // Storage quota or blocked
  }
}
