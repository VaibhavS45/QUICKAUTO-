import type { ScheduleSource } from '../../shared/contracts/schedule.js'

let scheduleSource: ScheduleSource | null = null

export function registerScheduleSource(source: ScheduleSource): void {
  scheduleSource = source
}

export function getScheduleSource(): ScheduleSource | null {
  return scheduleSource
}
