export const DAYS = [
  { short: 'SUN', title: 'Sun', date: 23, today: false },
  { short: 'MON', title: 'Mon', date: 24, today: true },
  { short: 'TUE', title: 'Tue', date: 25, today: false },
  { short: 'WED', title: 'Wed', date: 26, today: false },
  { short: 'THU', title: 'Thu', date: 27, today: false },
  { short: 'FRI', title: 'Fri', date: 28, today: false },
  { short: 'SAT', title: 'Sat', date: 29, today: false },
]

export const HOUR_START = 6
export const HOUR_END = 11
export const ROW_H = 106
export const GUTTER = 64
export const DAY_HEADER_H = 68
export const BOTTOM_PAD = 20
export const CARD_GAP_X = 8
export const CARD_GAP_Y = 7

export type ColorKey =
  | 'blue'
  | 'mint'
  | 'lime'
  | 'orange'
  | 'pink'
  | 'purple'
  | 'gray'
  | 'white'

export type IconName =
  | 'chat'
  | 'plane'
  | 'cart'
  | 'cake'
  | 'heart'
  | 'sun'
  | 'bell'

export interface EventDef {
  id: string
  title: string
  meta: string
  icon: IconName
  color: ColorKey
  seed: number
}

export const COLORS: Record<ColorKey, [number, number, number]> = {
  blue: [158, 196, 250],
  mint: [154, 226, 195],
  lime: [228, 232, 140],
  orange: [255, 194, 138],
  pink: [255, 174, 190],
  purple: [211, 184, 255],
  gray: [228, 227, 223],
  white: [244, 243, 238],
}

export interface EventInstance extends EventDef {
  hour: number
  day: number
}

export const INITIAL_EVENTS: EventInstance[] = [
  {
    id: 'rent',
    title: 'Rent Reminder To Roommate',
    meta: '8:00 AM - daily - UTC',
    icon: 'chat',
    color: 'blue',
    seed: 4,
    day: 1,
    hour: 8,
  },
  {
    id: 'pr',
    title: 'Send Stale PR Alert To Jack',
    meta: '8:00 AM - weekdays - UTC',
    icon: 'plane',
    color: 'mint',
    seed: 7,
    day: 2,
    hour: 8,
  },
  {
    id: 'notes',
    title: 'Meeting Notes Digest',
    meta: '8:00 AM - weekdays - UTC',
    icon: 'bell',
    color: 'lime',
    seed: 2,
    day: 3,
    hour: 8,
  },
  {
    id: 'spend',
    title: 'Weekly Spend Report',
    meta: '7:00 AM - weekly - UTC',
    icon: 'cart',
    color: 'orange',
    seed: 9,
    day: 4,
    hour: 7,
  },
  {
    id: 'mom',
    title: 'Message Mom Happy Birthday',
    meta: '8:00 AM - yearly - UTC',
    icon: 'heart',
    color: 'pink',
    seed: 6,
    day: 5,
    hour: 8,
  },
  {
    id: 'wotd',
    title: 'Word Of The Day',
    meta: '7:00 AM - daily - UTC',
    icon: 'sun',
    color: 'purple',
    seed: 1,
    day: 5,
    hour: 7,
  },
  {
    id: 'outfit',
    title: 'Message Me Weather Matched Outfit',
    meta: '8:00 AM - daily - UTC',
    icon: 'sun',
    color: 'gray',
    seed: 3,
    day: 0,
    hour: 8,
  },
  {
    id: 'design',
    title: 'Design Review Digest',
    meta: '8:00 AM - weekdays - UTC',
    icon: 'bell',
    color: 'white',
    seed: 8,
    day: 3,
    hour: 8,
  },
  {
    id: 'slack',
    title: 'Slack Channel Summary',
    meta: '7:00 AM - weekdays - UTC',
    icon: 'chat',
    color: 'gray',
    seed: 5,
    day: 0,
    hour: 7,
  },
]

export function formatHour(hour: number, minutes = 0): string {
  const h = ((hour + 11) % 12) + 1
  const mm = String(minutes).padStart(2, '0')
  return `${h}:${mm} AM`
}

export function formatSlot(day: number, hour: number): string {
  return `${DAYS[day].title} ${formatHour(hour)}`
}

export interface Layout {
  width: number
}

export function slotAnchor(
  day: number,
  hour: number,
  width: number,
): { x: number; y: number; w: number; h: number } {
  const colW = (width - GUTTER) / 7
  return {
    x: GUTTER + day * colW + CARD_GAP_X,
    y: DAY_HEADER_H + (hour - HOUR_START) * ROW_H + CARD_GAP_Y,
    w: colW - CARD_GAP_X * 2,
    h: ROW_H - CARD_GAP_Y * 2,
  }
}
