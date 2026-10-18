import { describe, expect, it } from 'vitest'
import { formatHour, formatSlot, slotAnchor } from './week'

describe('formatHour', () => {
  it('formats hours as h:00 AM', () => {
    expect(formatHour(6)).toBe('6:00 AM')
    expect(formatHour(8)).toBe('8:00 AM')
    expect(formatHour(11)).toBe('11:00 AM')
  })
  it('formats minutes', () => {
    expect(formatHour(6, 21)).toBe('6:21 AM')
  })
})

describe('formatSlot', () => {
  it('joins day and time', () => {
    expect(formatSlot(2, 8)).toBe('Tue 8:00 AM')
    expect(formatSlot(0, 7)).toBe('Sun 7:00 AM')
  })
})

describe('slotAnchor', () => {
  const width = 1192

  it('places Mon 8 in the second column, third hour row', () => {
    const a = slotAnchor(1, 8, width)
    const b = slotAnchor(0, 7, width)
    expect(a.x).toBeGreaterThan(b.x)
    expect(a.y).toBeGreaterThan(b.y)
  })

  it('keeps card inside its column and row', () => {
    const colW = (width - 64) / 7
    for (let d = 0; d < 7; d++) {
      for (let h = 6; h < 11; h++) {
        const a = slotAnchor(d, h, width)
        expect(a.w).toBeLessThan(colW)
        expect(a.x).toBeGreaterThanOrEqual(64 + d * colW)
        expect(a.x + a.w).toBeLessThanOrEqual(64 + (d + 1) * colW)
        expect(a.h).toBeLessThan(106)
      }
    }
  })

  it('anchoring every slot stays inside the grid', () => {
    const last = slotAnchor(6, 10, width)
    expect(last.y + last.h).toBeLessThanOrEqual(68 + 5 * 106)
  })
})
