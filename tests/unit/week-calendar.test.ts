import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import WeekCalendar from '../../src/renderer/features/automations/shared/week-calendar.js'
import {
  BOTTOM_PAD,
  DAY_HEADER_H,
  HOUR_FIRST,
  HOUR_LAST,
  ROW_H,
  edgeScrollDelta,
  fanPlacement,
  gridHeight,
  hourLabel,
  hourLabelFull,
  moveToTopOfSlot,
  parseSlotKey,
  runAtForSlot,
  slotAnchor,
  slotFromPoint,
  slotHourFor,
  slotKey,
  weekCardsFor,
  weekDays,
  weekStartFor,
  type WeekEvent
} from '../../src/renderer/features/automations/shared/week-calendar-model.js'

function routineEvent(id: string, at: number, repeat: string, extra: Partial<WeekEvent> = {}): WeekEvent {
  return { id, title: `Do ${id}`, meta: `${repeat} 8:00 AM`, repeat, at, enabled: true, tools: [], ...extra }
}

const tuesday0800 = new Date(2026, 7, 25, 8, 0).getTime()

describe('week calendar slots', () => {
  it('anchors a week on Sunday and returns the seven days', () => {
    const start = weekStartFor(new Date(2026, 7, 26))
    expect(start).toBe('2026-08-23')
    const days = weekDays(start)
    expect(days).toHaveLength(7)
    expect(days[0].key).toBe('2026-08-23')
    expect(days[6].key).toBe('2026-08-29')
  })

  it('clamps card hours into the visible range', () => {
    expect(slotHourFor(new Date(2026, 7, 25, 3, 30).getTime())).toBe(3)
    expect(slotHourFor(new Date(2026, 7, 25, 17, 0).getTime())).toBe(17)
    expect(slotHourFor(tuesday0800)).toBe(8)
  })

  it('labels every hour with the right AM/PM face', () => {
    expect(hourLabel(0)).toBe('12 AM')
    expect(hourLabel(6)).toBe('6 AM')
    expect(hourLabel(11)).toBe('11 AM')
    expect(hourLabel(12)).toBe('12 PM')
    expect(hourLabel(13)).toBe('1 PM')
    expect(hourLabel(17)).toBe('5 PM')
    expect(hourLabel(23)).toBe('11 PM')
    expect(hourLabelFull(15)).toBe('3:00 PM')
    expect(hourLabelFull(7)).toBe('7:00 AM')
    expect(hourLabelFull(24)).toBe('12:00 AM')
  })

  it('spans the full day: 24 rows plus header and bottom pad', () => {
    expect(HOUR_FIRST).toBe(0)
    expect(HOUR_LAST).toBe(24)
    expect(gridHeight()).toBe(DAY_HEADER_H + 24 * ROW_H + BOTTOM_PAD)
    expect(gridHeight()).toBe(2598)
  })

  it('scrolls toward edges while dragging and holds position in the middle', () => {
    expect(edgeScrollDelta(300, 600)).toBe(0)
    expect(edgeScrollDelta(0, 600)).toBe(-10)
    expect(edgeScrollDelta(10, 600)).toBe(-8)
    expect(edgeScrollDelta(590, 600)).toBe(8)
    expect(edgeScrollDelta(600, 600)).toBe(10)
  })

  it('maps daily routines onto the first weekday and weekly ones on lucky days inside the week', () => {
    const days = weekDays('2026-08-23')
    const daily = routineEvent('daily', tuesday0800, 'daily')
    const friday = routineEvent('weekly', tuesday0800, 'weekly', { tools: ['slack'] })
    expect(weekCardsFor([daily, friday], days)).toMatchObject({
      cards: [
        { id: 'daily', day: 0, hour: 8 },
        { id: 'weekly', day: 2, hour: 8 }
      ],
      skipped: 0
    })
  })

  it('places run records only when their day is inside the week and skips the rest', () => {
    const days = weekDays('2026-08-23')
    const inside = new Date(2026, 7, 26, 9, 0).getTime()
    const outside = new Date(2026, 8, 3, 9, 0).getTime()
    const { cards, skipped } = weekCardsFor(
      [
        { id: 'r1', title: 'Runner', meta: 'done 9:00 AM', at: inside, status: 'succeeded' },
        { id: 'r2', title: 'Stray', meta: 'run', at: outside, status: 'succeeded' }
      ],
      days
    )
    expect(cards).toHaveLength(1)
    expect(skipped).toBe(1)
    expect(cards[0]).toMatchObject({ id: 'r1', day: 3, hour: 9, color: 'mint' })
  })

  it('marks paused routines gray', () => {
    const days = weekDays('2026-08-23')
    const { cards } = weekCardsFor([routineEvent('paused', tuesday0800, 'daily', { enabled: false })], days)
    expect(cards[0].color).toBe('gray')
  })

  it('colors failed runs pink and succeeded runs mint', () => {
    const days = weekDays('2026-08-23')
    const { cards } = weekCardsFor(
      [
        { id: 'a', title: 'Ok', meta: 'x', at: tuesday0800, status: 'succeeded' },
        { id: 'b', title: 'Bad', meta: 'x', at: tuesday0800, status: 'failed' }
      ],
      days
    )
    expect(cards.map((c) => c.color)).toEqual(['mint', 'pink'])
  })
})

describe('week calendar stack ordering', () => {
  it('moves a dropped card to the top of its new slot', () => {
    const slots = {
      a: { day: 2, hour: 8 },
      b: { day: 2, hour: 8 },
      c: { day: 3, hour: 7 }
    }
    expect(moveToTopOfSlot(['c', 'a', 'b'], 'c', slots.c, slots)).toEqual(['c', 'a', 'b'])
    expect(moveToTopOfSlot(['c', 'a', 'b'], 'c', { day: 4, hour: 7 }, slots)).toEqual(['a', 'b', 'c'])
    expect(moveToTopOfSlot(['c', 'a', 'b'], 'a', slots.a, slots)).toEqual(['c', 'a', 'b'])
  })

  it('round-trips slot keys', () => {
    const slot = { day: 4, hour: 9 }
    expect(parseSlotKey(slotKey(slot))).toEqual(slot)
  })
})

describe('week calendar geometry', () => {
  it('anchors cards inside their column and row', () => {
    const width = 1192
    const colW = (width - 64) / 7
    const a = slotAnchor(5, 7, width)
    expect(a.x).toBeGreaterThanOrEqual(64 + 5 * colW)
    expect(a.x + a.w).toBeLessThanOrEqual(64 + 6 * colW)
    expect(a.y).toBeGreaterThan(slotAnchor(5, 6, width).y)
  })

  it('maps pointer coordinates back to a clamped slot', () => {
    const width = 1192
    expect(slotFromPoint(10, 10, width)).toEqual({ day: 0, hour: 0 })
    expect(slotFromPoint(1180, 700, width)).toEqual({ day: 6, hour: 6 })
  })

  it('fans cards out around the center without leaving the pile', () => {
    for (let i = 0; i < 9; i++) {
      const place = fanPlacement(i, 9, i * 11, 129)
      expect(place.rotate).toBeLessThanOrEqual(25)
      expect(place.rotate).toBeGreaterThanOrEqual(-25)
      expect(Math.abs(place.x)).toBeLessThanOrEqual(130)
      expect(Math.abs(place.y)).toBeLessThanOrEqual(130)
    }
  })
})

describe('runAtForSlot', () => {
  const weekStart = weekStartFor(new Date(2026, 7, 26)) // Sunday 2026-08-23
  const days = weekDays(weekStart)
  const tuesday0830 = new Date(2026, 7, 25, 8, 30).getTime() // 2026-08-25 08:30

  it('moves the routine to the dragged day and hour while preserving minutes', () => {
    const friday1030 = runAtForSlot({ day: 5, hour: 10 }, days, tuesday0830)
    const d = new Date(friday1030)
    expect(d.getDay()).toBe(days[5].date.getDay())
    expect(d.getHours()).toBe(10)
    expect(d.getMinutes()).toBe(30)
  })

  it('clamps the dragged hour into the visible range', () => {
    const late = runAtForSlot({ day: 0, hour: 25 }, days, tuesday0830)
    expect(new Date(late).getHours()).toBe(23)
    const early = runAtForSlot({ day: 0, hour: -3 }, days, tuesday0830)
    expect(new Date(early).getHours()).toBe(0)
  })

  it('falls back to the original runAt when the slot day is out of range', () => {
    expect(runAtForSlot({ day: 99, hour: 8 }, days, tuesday0830)).toBe(tuesday0830)
  })
})

describe('week calendar component', () => {
  it('renders a card for every routine scheduled this week', () => {
    const weekStart = weekStartFor(new Date())
    const midWeek = new Date(`${weekDays(weekStart)[2].key}T08:00:00`).getTime()
    const html = renderToStaticMarkup(
      createElement(WeekCalendar, {
        events: [routineEvent('daily', tuesday0800, 'daily'), routineEvent('once', midWeek, 'once', { tools: ['gmail'] })],
        onOpen: () => {}
      })
    )
    expect(html).toContain('wc-card')
    expect(html).toContain('Do daily')
    expect(html).toContain('Do once')
    expect(html).toContain('wc-grid')
  })

  it('renders run events placed on their own days', () => {
    const weekStart = weekStartFor(new Date())
    const thursday = new Date(`${weekDays(weekStart)[4].key}T09:00:00`).getTime()
    const html = renderToStaticMarkup(
      createElement(WeekCalendar, {
        events: [{ id: 'r7', title: 'Nightly sync', meta: '9:00 AM · done', at: thursday, status: 'succeeded' }],
        onOpen: () => {}
      })
    )
    expect(html).toContain('Nightly sync')
    expect(html).toContain('data-wc-card="r7"')
  })
})
