import { formatAt, formatMonth, formatTime } from '../../lib/format.js'

export function localDayKey(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function addDaysKey(key: string, delta: number): string {
  const date = new Date(`${key}T00:00:00`)
  date.setDate(date.getDate() + delta)
  return localDayKey(date)
}

export function dayLabel(key: string, todayKey: string): string {
  if (key === todayKey) return 'Today'
  if (key === addDaysKey(todayKey, 1)) return 'Tomorrow'
  const date = new Date(`${key}T00:00:00`)
  return Number.isNaN(date.getTime())
    ? key
    : date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}

export function timeLabel(at: number | Date): string {
  return formatTime(at)
}

/** "Scheduled · at 9:45 AM" style used in schedule meta lines. */
export function atLabel(at: number | Date): string {
  return formatAt(at)
}

export function pastDayLabel(key: string, todayKey: string): string {
  if (key === todayKey) return 'Today'
  if (key === addDaysKey(todayKey, -1)) return 'Yesterday'
  return dayLabel(key, todayKey)
}

export function routineTitle(prompt: string): string {
  const clean = prompt.replace(/^(?:When:\s*[^.]*?\.\s*)+/i, '').trim()
  const firstLine = (clean || prompt).split('\n')[0] ?? prompt
  return firstLine.length > 80 ? `${firstLine.slice(0, 80)}…` : firstLine
}

export interface MonthCell {
  key: string
  date: Date
  inMonth: boolean
}

export function monthGrid(year: number, monthIndex: number): MonthCell[] {
  const first = new Date(year, monthIndex, 1)
  const start = new Date(year, monthIndex, 1 - first.getDay())
  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(start)
    date.setDate(start.getDate() + i)
    return { key: localDayKey(date), date, inMonth: date.getMonth() === monthIndex }
  })
}

export function monthLabel(year: number, monthIndex: number): string {
  return formatMonth(year, monthIndex)
}

// ponytail: naive repeat heuristic (daily → every day, weekly → same weekday), expand if scheduler exposes real occurrences
export function routineOccursOn(routine: { runAt: number; repeat: string }, key: string): boolean {
  if (/weekday/i.test(routine.repeat)) {
    const day = new Date(`${key}T00:00:00`).getDay()
    return day >= 1 && day <= 5
  }
  if (/daily|every\s*day/i.test(routine.repeat)) return true
  const runDay = localDayKey(new Date(routine.runAt))
  if (runDay === key) return true
  if (/week/i.test(routine.repeat)) {
    const a = new Date(`${runDay}T00:00:00`)
    const b = new Date(`${key}T00:00:00`)
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return false
    return a.getDay() === b.getDay()
  }
  return false
}
