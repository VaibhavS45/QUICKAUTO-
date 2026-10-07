/** Pure time helpers for the calendar week grid. No React, no DOM. */

export const HOUR_H = 64
export const SNAP_STEP = 0.25
export const DEFAULT_HOURS = 1

/** Snap a fractional hour to the grid step, clamped to [0, 24 - step]. */
export function snapHour(h: number, step: number = SNAP_STEP): number {
  const snapped = Math.round(h / step) * step
  return Math.min(24 - step, Math.max(0, snapped))
}

/** Fractional start hour from a vertical offset inside a day column. */
export function hourFromOffset(offsetY: number, hourH: number = HOUR_H, step: number = SNAP_STEP): number {
  return snapHour(offsetY / hourH, step)
}

/** End hour for a new event, never past midnight. */
export function defaultEnd(start: number, hours: number = DEFAULT_HOURS): number {
  return Math.min(24, start + hours)
}

/** "10:15AM", "3:00PM", "12:00AM". */
export function formatClock(h: number): string {
  const totalMins = Math.round(h * 60)
  const hh = Math.floor(totalMins / 60) % 24
  const mm = totalMins % 60
  const suffix = hh < 12 ? 'AM' : 'PM'
  const h12 = hh % 12 === 0 ? 12 : hh % 12
  return `${h12}:${String(mm).padStart(2, '0')}${suffix}`
}

/** "10:15AM – 3:00PM". */
export function formatRange(start: number, end: number): string {
  return `${formatClock(start)} – ${formatClock(end)}`
}

export interface QuarterOption {
  value: number
  label: string
}

/** 96 start/end options for the editor selects, 15 minutes apart. */
export function quarterOptions(): QuarterOption[] {
  return Array.from({ length: 96 }, (_, i) => {
    const value = i * 0.25
    return { value, label: formatClock(value) }
  })
}

export interface PopoverPos {
  left: number
  top: number
}

/** Clamp a fixed-position popover so it stays inside the viewport.
 * Kept for tests; the calendar now uses a right-side panel instead. */
export function clampPopover(
  x: number,
  y: number,
  w: number,
  h: number,
  vw: number,
  vh: number
): PopoverPos {
  return {
    left: Math.min(Math.max(0, x), Math.max(0, vw - w)),
    top: Math.min(Math.max(0, y), Math.max(0, vh - h))
  }
}

export interface DayLayout {
  col: number
  cols: number
}

/**
 * Side-by-side columns for same-day overlapping events (macOS style).
 * Greedy cluster + first-fit column assignment.
 * ponytail: O(n^2) scan, fine for a day column; interval tree if days hold hundreds.
 */
export function layoutDayEvents<T extends { start: number; end: number }>(list: T[]): DayLayout[] {
  const idx = list.map((_, i) => i).sort((a, b) => list[a]!.start - list[b]!.start || list[a]!.end - list[b]!.end)
  const out: DayLayout[] = new Array(list.length)
  let cluster: number[] = []
  let clusterEnd = -1
  const flush = (): void => {
    const colsEnd: number[] = []
    for (const i of cluster) {
      let c = colsEnd.findIndex((end) => list[i]!.start >= end)
      if (c === -1) {
        c = colsEnd.length
        colsEnd.push(list[i]!.end)
      } else {
        colsEnd[c] = list[i]!.end
      }
      out[i] = { col: c, cols: 0 }
    }
    for (const i of cluster) out[i]!.cols = colsEnd.length
    cluster = []
    clusterEnd = -1
  }
  for (const i of idx) {
    if (cluster.length > 0 && list[i]!.start >= clusterEnd) flush()
    cluster.push(i)
    clusterEnd = Math.max(clusterEnd, list[i]!.end)
  }
  if (cluster.length > 0) flush()
  return out
}
