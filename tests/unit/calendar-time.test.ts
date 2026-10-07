import { describe, expect, test } from 'vitest'
import {
  clampPopover,
  defaultEnd,
  formatClock,
  formatRange,
  hourFromOffset,
  layoutDayEvents,
  quarterOptions,
  snapHour
} from '../../src/renderer/calendar/time'

describe('snapHour', () => {
  test('snaps to quarters by default', () => {
    expect(snapHour(10.13)).toBe(10.25)
    expect(snapHour(10.1)).toBe(10)
    expect(snapHour(10.4)).toBe(10.5)
  })
  test('clamps to the day', () => {
    expect(snapHour(-2)).toBe(0)
    expect(snapHour(25)).toBe(23.75)
  })
})

describe('hourFromOffset', () => {
  test('converts a click offset to a snapped hour', () => {
    expect(hourFromOffset(10.25 * 64)).toBe(10.25)
    expect(hourFromOffset(0)).toBe(0)
    expect(hourFromOffset(24 * 64)).toBe(23.75)
  })
})

describe('defaultEnd', () => {
  test('adds an hour without passing midnight', () => {
    expect(defaultEnd(10.25)).toBe(11.25)
    expect(defaultEnd(23.75)).toBe(24)
  })
})

describe('formatClock', () => {
  test('formats edge hours', () => {
    expect(formatClock(0)).toBe('12:00AM')
    expect(formatClock(12)).toBe('12:00PM')
    expect(formatClock(10.25)).toBe('10:15AM')
    expect(formatClock(15)).toBe('3:00PM')
    expect(formatClock(23.75)).toBe('11:45PM')
    expect(formatClock(24)).toBe('12:00AM')
  })
  test('pads minutes', () => {
    expect(formatRange(10.25, 15)).toBe('10:15AM – 3:00PM')
  })
})

describe('quarterOptions', () => {
  test('covers the day in 96 steps', () => {
    const opts = quarterOptions()
    expect(opts).toHaveLength(96)
    expect(opts[0]).toEqual({ value: 0, label: '12:00AM' })
    expect(opts[95]).toEqual({ value: 23.75, label: '11:45PM' })
  })
})

describe('clampPopover', () => {
  test('keeps the popover on screen', () => {
    expect(clampPopover(100, 100, 300, 320, 1280, 800)).toEqual({ left: 100, top: 100 })
    expect(clampPopover(1200, 700, 300, 320, 1280, 800)).toEqual({ left: 980, top: 480 })
    expect(clampPopover(-50, -50, 300, 320, 1280, 800)).toEqual({ left: 0, top: 0 })
  })
})

describe('layoutDayEvents', () => {
  test('stacks overlapping events side by side', () => {
    const out = layoutDayEvents([{ start: 7.25, end: 8.25 }, { start: 7.75, end: 8.75 }])
    expect(out).toHaveLength(2)
    expect(out[0]!.cols).toBe(2)
    expect(out[1]!.cols).toBe(2)
    expect(out[0]!.col).not.toBe(out[1]!.col)
  })
  test('keeps separate events full width', () => {
    const out = layoutDayEvents([{ start: 8, end: 9 }, { start: 9.5, end: 10 }])
    expect(out).toEqual([{ col: 0, cols: 1 }, { col: 0, cols: 1 }])
  })
})
