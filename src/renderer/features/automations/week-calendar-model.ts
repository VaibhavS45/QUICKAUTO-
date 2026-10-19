import { addDaysKey, localDayKey, routineOccursOn } from './dates.js'

export const HOUR_FIRST = 6
export const HOUR_LAST = 22
export const ROW_H = 106
export const GUTTER = 64
export const DAY_HEADER_H = 34
export const BOTTOM_PAD = 20
export const CARD_GAP_X = 8
export const CARD_GAP_Y = 7

export interface WeekDay {
  key: string
  date: Date
}

export interface Slot {
  day: number
  hour: number
}

const ICON_NAMES = ['chat', 'plane', 'cart', 'cake', 'heart', 'sun', 'bell'] as const
export type CardIcon = (typeof ICON_NAMES)[number]

export const PALETTE: string[] = ['blue', 'mint', 'lime', 'orange', 'pink', 'purple', 'gray', 'white']

export interface WeekEvent {
  id: string
  title: string
  meta: string
  at: number
  repeat?: string
  enabled?: boolean
  status?: string
  tools?: string[]
}

export interface WeekCard {
  id: string
  title: string
  meta: string
  day: number
  hour: number
  seed: number
  icon: CardIcon
  color: string
}

export function weekStartFor(date: Date): string {
  return addDaysKey(localDayKey(date), -date.getDay())
}

export function weekDays(startKey: string): WeekDay[] {
  return Array.from({ length: 7 }, (_, i) => {
    const key = addDaysKey(startKey, i)
    return { key, date: new Date(`${key}T00:00:00`) }
  })
}

export function clampHour(hour: number): number {
  return Math.min(HOUR_LAST - 1, Math.max(HOUR_FIRST, hour))
}

export function slotHourFor(at: number): number {
  return clampHour(new Date(at).getHours())
}

export function seedFor(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
  return h
}

export function iconForEvent(event: WeekEvent): CardIcon {
  const hint = `${(event.tools ?? []).join(' ')} ${event.title}`.toLowerCase()
  if (/gmail|mail|email|send|alert|notify|summary digest/.test(hint)) return 'plane'
  if (/slack|chat|message|im\b/.test(hint)) return 'chat'
  if (/weather|forecast|sunrise/.test(hint)) return 'sun'
  if (/shop|spend|cart|order|expense|spending/.test(hint)) return 'cart'
  if (/birthday|mom|heart|love/.test(hint)) return 'heart'
  if (/remind/.test(hint)) return 'bell'
  return ICON_NAMES[seedFor(event.id) % ICON_NAMES.length]
}

function colorForRoutineEvent(event: WeekEvent): string {
  if (event.enabled === false) return 'gray'
  return PALETTE[seedFor(event.id) % PALETTE.length]
}

function colorForRunEvent(event: WeekEvent): string {
  const status = event.status ?? ''
  if (/fail|error|cancel/.test(status)) return 'pink'
  if (/done|succeed|ok/.test(status)) return 'mint'
  if (/active|running|upcoming/.test(status)) return 'blue'
  return 'gray'
}

/** Map events onto the week grid. Routines (repeat present) land on their first
 *  occurrence day; plain events (run records) only when their day falls inside
 *  the week. Skipped events stay in the list view. */
export function weekCardsFor(events: WeekEvent[], days: WeekDay[]): { cards: WeekCard[]; skipped: number } {
  const cards: WeekCard[] = []
  let skipped = 0
  for (const event of events) {
    let day: number
    if (event.repeat !== undefined) {
      const found = days.findIndex((d) => routineOccursOn({ runAt: event.at, repeat: event.repeat! }, d.key))
      if (found < 0) {
        skipped++
        continue
      }
      day = found
    } else {
      const key = localDayKey(new Date(event.at))
      const found = days.findIndex((d) => d.key === key)
      if (found < 0) {
        skipped++
        continue
      }
      day = found
    }
    cards.push({
      id: event.id,
      title: event.title,
      meta: event.meta,
      day,
      hour: slotHourFor(event.at),
      seed: seedFor(event.id),
      icon: iconForEvent(event),
      color: event.repeat !== undefined ? colorForRoutineEvent(event) : colorForRunEvent(event)
    })
  }
  return { cards, skipped }
}

export function slotKey(slot: Slot): string {
  return `${slot.day}-${slot.hour}`
}

export function parseSlotKey(key: string): Slot {
  const [day, hour] = key.split('-').map(Number)
  return { day, hour }
}

/** Stack order list: end of array is the top card. Dropping on a new slot moves the card to the top of it. */
export function moveToTopOfSlot(order: string[], id: string, target: Slot, slots: Record<string, Slot>): string[] {
  const previous = slots[id]
  if (previous && slotKey(previous) === slotKey(target)) return order
  return [...order.filter((key) => key !== id), id]
}

export interface FanPlacement {
  x: number
  y: number
  rotate: number
}

export function fanPlacement(index: number, count: number, seed: number, radius: number): FanPlacement {
  const t = count <= 1 ? 0.5 : index / (count - 1)
  const theta = ((-115 + t * 230) * Math.PI) / 180
  return {
    x: Math.cos(theta) * radius,
    y: Math.sin(theta) * radius * 0.82,
    rotate: ((seed * 53) % 51) - 25
  }
}

export function clampValue(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

export function slotAnchor(day: number, hour: number, width: number): { x: number; y: number; w: number; h: number } {
  const colW = (width - GUTTER) / 7
  return {
    x: GUTTER + day * colW + CARD_GAP_X,
    y: DAY_HEADER_H + (hour - HOUR_FIRST) * ROW_H + CARD_GAP_Y,
    w: colW - CARD_GAP_X * 2,
    h: ROW_H - CARD_GAP_Y * 2
  }
}

export function slotFromPoint(relX: number, relY: number, width: number): Slot {
  const colW = (width - GUTTER) / 7
  return {
    day: clampValue(Math.floor((relX - GUTTER) / colW), 0, 6),
    hour:
      clampValue(Math.floor((relY - DAY_HEADER_H) / ROW_H), 0, HOUR_LAST - HOUR_FIRST - 1) + HOUR_FIRST
  }
}

export function gridHeight(): number {
  return DAY_HEADER_H + (HOUR_LAST - HOUR_FIRST) * ROW_H + BOTTOM_PAD
}
