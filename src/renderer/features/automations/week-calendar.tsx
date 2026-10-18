import { addDaysKey, localDayKey, routineOccursOn, timeLabel } from './dates.js'

export interface WeekEvent {
  id: string
  title: string
  /** Secondary line shown on the chip (e.g. "9:30 AM · succeeded"). */
  meta: string
  at: number
  /** Present → event recurs; place it on every day its repeat matches. */
  repeat?: string
  status?: string
  enabled?: boolean
  tools?: string[]
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

export default function WeekCalendar(props: {
  events: WeekEvent[]
  onOpen(id: string): void
}): React.JSX.Element {
  const todayKey = localDayKey()
  const startKey = addDaysKey(todayKey, -new Date().getDay())
  return (
    <div className="automations-week">
      {DAY_NAMES.map((name, i) => {
        const key = addDaysKey(startKey, i)
        const list = props.events
          .filter((e) => e.repeat !== undefined
            ? routineOccursOn({ runAt: e.at, repeat: e.repeat }, key)
            : localDayKey(new Date(e.at)) === key)
          .sort((a, b) => a.at - b.at)
        return (
          <div key={key} className={`automations-cell${key === todayKey ? ' is-today' : ''}`}>
            <div className="automations-week-head">
              <strong>{name}</strong>
              <span className="automations-cell-day">{Number(key.slice(-2))}</span>
            </div>
            {list.slice(0, 3).map((e) => (
              <button key={`${e.id}-${key}`} type="button" className="automations-chip" title={e.meta} onClick={() => props.onOpen(e.id)}>
                <strong>{timeLabel(e.at)}</strong> {e.title}
              </button>
            ))}
            {list.length > 3 && <small className="automations-more">+{list.length - 3} more</small>}
          </div>
        )
      })}
    </div>
  )
}
