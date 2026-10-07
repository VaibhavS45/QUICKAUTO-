import { useEffect, useMemo, useRef, useState } from 'react'
import { DayPicker } from 'react-day-picker'
import '../styles.css'
import { HOUR_H, defaultEnd, formatClock, formatRange, hourFromOffset, layoutDayEvents, quarterOptions, snapHour } from './time'

interface Bot {
  id: string
  name: string
  color: string
}

interface CalEvent {
  id: number
  botId: string
  title: string
  dayISO: string
  start: number
  end: number
}

const BOTS: Bot[] = [
  { id: 'clover', name: 'Clover', color: '#3b82f6' },
  { id: 'plum', name: 'Plum', color: '#22c55e' }
]

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]
const WD_SHORT = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
/* Grid chrome as inline colors so it can never fall back to white text-color
   borders again (the "white lines" bug). */
const GRID = '#23262e'
const GRID_FAINT = '#15171c'
const TODAY_TINT = 'rgba(59,130,246,0.07)'
const TODAY_RED = '#ff453a'
let nextId = 1

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}
function iso(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}
/** Monday-first week containing d. */
function weekDays(anchor: Date): Date[] {
  const dow = (anchor.getDay() + 6) % 7
  const mon = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - dow)
  return Array.from({ length: 7 }, (_, i) => new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i))
}
function hourLabel(h: number): string {
  if (h === 0) return '12 AM'
  if (h < 12) return `${h} AM`
  if (h === 12) return '12 PM'
  return `${h - 12} PM`
}

/** Automations schedule — macOS-style week grid, drag-to-create, right inspector. */
export default function CalendarApp(): React.JSX.Element {
  const now = useMemo(() => new Date(), [])
  const [anchor, setAnchor] = useState<Date>(now)
  const [miniCursor, setMiniCursor] = useState({ y: now.getFullYear(), m: now.getMonth() })
  const [tab, setTab] = useState<'Schedule' | 'Run logs' | 'Webhooks'>('Schedule')
  const [view, setView] = useState<'List' | 'Calendar'>('Calendar')
  const [awake, setAwake] = useState(true)
  const [query, setQuery] = useState('')
  const [botFilter, setBotFilter] = useState('all')
  const [draft, setDraft] = useState('')
  const [events, setEvents] = useState<CalEvent[]>([])
  const [selId, setSelId] = useState<number | null>(null)
  const [drag, setDrag] = useState<{ dayISO: string; start: number; cur: number; live: number } | null>(null)
  const [move, setMove] = useState<{ id: number; dur: number; grab: number } | null>(null)
  const [resize, setResize] = useState<{ id: number; edge: 'top' | 'bottom' } | null>(null)
  const movedRef = useRef(false)
  const downPos = useRef<{ x: number; y: number } | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const days = useMemo(() => weekDays(anchor), [anchor])
  const tz = useMemo(() => {
    const off = -now.getTimezoneOffset()
    const sign = off >= 0 ? '+' : '-'
    const a = Math.abs(off)
    return `GMT${sign}${Math.floor(a / 60)}:${String(a % 60).padStart(2, '0')}`
  }, [now])

  useEffect(() => {
    window.palette.calendarWindowEvent('opened')
    window.palette.getAwake().then((s) => setAwake(s.enabled)).catch(() => {})
    const off = window.palette.onCalendarDraft((text) => setDraft(text))
    const onUnload = (): void => window.palette.calendarWindowEvent('closed')
    window.addEventListener('beforeunload', onUnload)
    return () => {
      off()
      window.removeEventListener('beforeunload', onUnload)
      window.palette.calendarWindowEvent('closed')
    }
  }, [])

  // Start scrolled near 8 AM like macOS Calendar.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 8 * HOUR_H })
  }, [])

  const visibleEvents = events.filter((e) => botFilter === 'all' || e.botId === botFilter)
  const botsShown = BOTS.filter((b) => b.name.toLowerCase().includes(query.toLowerCase()))
  const rangeLabel = `${MONTHS[days[0]!.getMonth()]} ${days[0]!.getDate()} – ${days[6]!.getDate()}, ${days[6]!.getFullYear()}`
  const nowTop = (now.getHours() + now.getMinutes() / 60) * HOUR_H

  function offsetToHour(day: Date, clientY: number, target: HTMLDivElement): number {
    void day
    const rect = target.getBoundingClientRect()
    return hourFromOffset(clientY - rect.top)
  }

  /** Day column under the cursor (for dragging events across days). */
  function dayColAt(x: number, y: number): { iso: string; el: HTMLDivElement } | null {
    const t = document.elementFromPoint(x, y)?.closest?.('[data-day]')
    if (!t) return null
    return { iso: (t as HTMLElement).dataset.day!, el: t as HTMLDivElement }
  }

  function rawHourIn(col: HTMLDivElement, clientY: number): number {
    return (clientY - col.getBoundingClientRect().top) / HOUR_H
  }

  /** Move an existing event: press-drag the card, across time and days. */
  function onEvPointerDown(ev: CalEvent, e: React.PointerEvent<HTMLDivElement>): void {
    if (e.button !== 0) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const col = e.currentTarget.closest('[data-day]') as HTMLDivElement | null
    const h = col ? rawHourIn(col, e.clientY) : ev.start
    downPos.current = { x: e.clientX, y: e.clientY }
    movedRef.current = false
    setMove({ id: ev.id, dur: ev.end - ev.start, grab: h - ev.start })
  }

  function onEvPointerMove(ev: CalEvent, e: React.PointerEvent<HTMLDivElement>): void {
    if (!move || move.id !== ev.id) return
    if (downPos.current && Math.hypot(e.clientX - downPos.current.x, e.clientY - downPos.current.y) > 4) movedRef.current = true
    const found = dayColAt(e.clientX, e.clientY)
    const col = found?.el ?? (e.currentTarget.closest('[data-day]') as HTMLDivElement | null)
    if (!col) return
    const s = Math.min(24 - move.dur, Math.max(0, snapHour(rawHourIn(col, e.clientY) - move.grab)))
    const dayISO = found?.iso ?? ev.dayISO
    setEvents((list) => {
      if (list.some((x) => x.id !== ev.id && x.dayISO === dayISO && s < x.end && x.start < s + move.dur)) return list
      return list.map((x) => (x.id === ev.id ? { ...x, dayISO, start: s, end: s + move.dur } : x))
    })
  }

  /** Resize an event by its top/bottom edge. */
  function onEdgeDown(ev: CalEvent, edge: 'top' | 'bottom', e: React.PointerEvent<HTMLDivElement>): void {
    if (e.button !== 0) return
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    movedRef.current = false
    setResize({ id: ev.id, edge })
  }

  function onEdgeMove(ev: CalEvent, e: React.PointerEvent<HTMLDivElement>): void {
    if (!resize || resize.id !== ev.id) return
    movedRef.current = true
    const col = e.currentTarget.closest('[data-day]') as HTMLDivElement | null
    if (!col) return
    const h = snapHour(rawHourIn(col, e.clientY))
    if (resize.edge === 'top') {
      const ns = Math.min(ev.end - 0.25, Math.max(0, h))
      setEvents((list) => {
        if (list.some((x) => x.id !== ev.id && x.dayISO === ev.dayISO && ns < x.end && x.start < ev.end)) return list
        return list.map((x) => (x.id === ev.id ? { ...x, start: ns } : x))
      })
    } else {
      const ne = Math.max(ev.start + 0.25, Math.min(24, h <= ev.start ? ev.start + 0.25 : h))
      setEvents((list) => {
        if (list.some((x) => x.id !== ev.id && x.dayISO === ev.dayISO && ev.start < x.end && x.start < ne)) return list
        return list.map((x) => (x.id === ev.id ? { ...x, end: ne } : x))
      })
    }
  }

  function commitDrag(day: Date, lo: number, hi: number): void {
    const botId = botFilter !== 'all' ? botFilter : BOTS[0]!.id
    const bot = BOTS.find((b) => b.id === botId)!
    const id = nextId++
    const start = snapHour(Math.min(lo, hi))
    const end = Math.max(lo, hi) - Math.min(lo, hi) < SNAP_MIN ? defaultEnd(start) : snapHour(Math.max(lo, hi))
    const title = botFilter !== 'all' ? bot.name : 'New Event'
    setEvents((ev) => [...ev, { id, botId, title, dayISO: iso(day), start, end: Math.max(end, start + 0.25) }])
    setSelId(id)
  }

  const SNAP_MIN = 0.05

  function onColPointerDown(day: Date, e: React.PointerEvent<HTMLDivElement>): void {
    if (e.button !== 0) return
    const target = e.currentTarget
    target.setPointerCapture(e.pointerId)
    const h = offsetToHour(day, e.clientY, target)
    const raw = (e.clientY - target.getBoundingClientRect().top) / HOUR_H
    setDrag({ dayISO: iso(day), start: h, cur: h, live: raw })
  }

  function onColPointerMove(day: Date, e: React.PointerEvent<HTMLDivElement>): void {
    if (!drag || drag.dayISO !== iso(day)) return
    const rect = e.currentTarget.getBoundingClientRect()
    setDrag({ ...drag, cur: offsetToHour(day, e.clientY, e.currentTarget), live: (e.clientY - rect.top) / HOUR_H })
  }

  function onColPointerUp(day: Date, e: React.PointerEvent<HTMLDivElement>): void {
    if (!drag || drag.dayISO !== iso(day)) return
    const lo = Math.min(drag.start, drag.cur)
    const hi = Math.max(drag.start, drag.cur)
    // Recompute from the release point so a scroll-then-release stays accurate.
    const at = offsetToHour(day, e.clientY, e.currentTarget)
    const flo = Math.min(drag.start, at)
    const fhi = Math.max(drag.start, at)
    setDrag(null)
    if (fhi - flo < SNAP_MIN && hi - lo < SNAP_MIN) commitDrag(day, at, at)
    else commitDrag(day, flo, fhi)
  }

  function dropOnDay(day: Date, e: React.DragEvent): void {
    e.preventDefault()
    const botId = e.dataTransfer.getData('text/bot')
    const bot = BOTS.find((b) => b.id === botId)
    if (!bot) return
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
    const start = hourFromOffset(e.clientY - rect.top)
    const id = nextId++
    setEvents((ev) => [...ev, { id, botId, title: bot.name, dayISO: iso(day), start, end: defaultEnd(start) }])
    setSelId(id)
  }

  function addNow(): void {
    const n = new Date()
    const start = snapHour(n.getHours() + n.getMinutes() / 60)
    const botId = botFilter !== 'all' ? botFilter : BOTS[0]!.id
    const bot = BOTS.find((b) => b.id === botId)!
    const id = nextId++
    setEvents((ev) => [...ev, { id, botId, title: bot.name, dayISO: iso(anchor), start, end: defaultEnd(start) }])
    setSelId(id)
  }

  function openEditor(ev: CalEvent): void {
    setSelId(ev.id)
  }

  function updateSel(patch: Partial<CalEvent>): void {
    setEvents((list) => list.map((ev) => (ev.id === selId ? { ...ev, ...patch } : ev)))
  }

  function closeEditor(): void {
    setSelId(null)
  }

  function deleteSel(): void {
    setEvents((list) => list.filter((ev) => ev.id !== selId))
    closeEditor()
  }

  const sel = events.find((e) => e.id === selId) ?? null
  const selDay = sel ? days.find((d) => iso(d) === sel.dayISO) : undefined
  const selDayLabel = selDay ? `${selDay.getDate()} ${MONTHS[selDay.getMonth()]!.slice(0, 3)} ${selDay.getFullYear()}` : sel?.dayISO ?? ''
  const quarters = useMemo(() => quarterOptions(), [])

  const miniMonth = new Date(miniCursor.y, miniCursor.m, 1)

  function pickDay(d: Date | undefined): void {
    if (!d) return
    setAnchor(d)
    setMiniCursor({ y: d.getFullYear(), m: d.getMonth() })
  }

  return (
    <div className="relative flex h-screen bg-black text-neutral-200 select-none">
      {/* Sidebar — full height */}
      <aside className="flex w-[280px] shrink-0 flex-col border-r border-neutral-900 bg-neutral-950 px-4 pb-3">
        {/* Drag strip clearing the floating macOS traffic lights */}
        <div className="window-titlebar shrink-0 h-11" />
        <div className="flex items-center pt-1 text-[11px] font-semibold tracking-widest text-neutral-400">
          ⚇ MY BOTS
          <div className="flex-1" />
          <span className="rounded-full bg-neutral-800 px-1.5 text-neutral-300">{botsShown.length}</span>
        </div>
        <div className="mt-2 flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900/60 px-2.5 py-1.5 text-[13px]">
          <span className="text-neutral-500">⌕</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search bots"
            className="w-full bg-transparent text-neutral-200 outline-none placeholder:text-neutral-600"
          />
        </div>
        <div className="mt-1 overflow-y-auto">
          {botsShown.map((b) => (
            <div
              key={b.id}
              draggable
              onDragStart={(e) => e.dataTransfer.setData('text/bot', b.id)}
              className="flex cursor-grab items-center gap-2.5 rounded-lg px-2 py-2 hover:bg-neutral-900 active:cursor-grabbing"
            >
              <span className="text-neutral-600">⋮⋮</span>
              <span className="flex h-7 w-7 items-center justify-center rounded-lg text-sm" style={{ background: `${b.color}22` }}>◣</span>
              <div>
                <div className="text-[13px] font-medium text-white">{b.name}</div>
                <div className="text-[11px] text-neutral-500">BotAgent</div>
              </div>
            </div>
          ))}
          {botsShown.length === 0 && <p className="px-2 py-2 text-[13px] text-neutral-600">No bots match.</p>}
        </div>
        <div className="flex-1" />
        <div className="border-t border-neutral-900 pt-3">
          <DayPicker
            mode="single"
            selected={anchor}
            onSelect={pickDay}
            month={miniMonth}
            onMonthChange={(m) => setMiniCursor({ y: m.getFullYear(), m: m.getMonth() })}
            weekStartsOn={1}
            showOutsideDays
            fixedWeeks
            formatters={{ formatWeekdayName: (d) => d.toLocaleDateString('en-US', { weekday: 'narrow' }) }}
            classNames={{
              root: 'w-full',
              months: 'w-full',
              month: 'w-full',
              month_caption: 'flex h-8 items-center justify-between px-1',
              caption_label: 'text-[13px] font-medium text-neutral-300',
              nav: 'flex gap-1',
              button_previous: 'rounded px-1.5 py-0.5 text-neutral-400 hover:bg-neutral-900 hover:text-white',
              button_next: 'rounded px-1.5 py-0.5 text-neutral-400 hover:bg-neutral-900 hover:text-white',
              chevron: 'h-4 w-4',
              month_grid: 'mt-1 w-full table-fixed border-collapse',
              weekday: 'w-9 pb-1 text-center text-[11px] font-normal text-neutral-500',
              day: 'p-0 text-center',
              day_button:
                'mx-auto flex h-9 w-9 items-center justify-center rounded-full text-[15px] text-neutral-200 hover:bg-neutral-800',
              selected: 'mini-selected',
              today: 'mini-today',
              outside: 'mini-outside'
            }}
          />
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
      {/* Top bar — window drag region (frameless window, no title bar) */}
      <div className="window-titlebar flex shrink-0 items-center gap-3 px-4 pt-3">
        <div className="flex items-center gap-2 text-[17px] font-semibold text-white">
          <span className="text-blue-500">▦</span> Automations
          <span className="text-xs font-normal text-neutral-600">CalTen</span>
        </div>
        <div className="ml-2 flex rounded-lg border border-neutral-800 bg-neutral-900/80 p-0.5 text-[13px]">
          {(['Schedule', 'Run logs', 'Webhooks'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md px-3 py-1 ${tab === t ? 'bg-neutral-700/80 text-white' : 'text-neutral-400 hover:text-white'}`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <button onClick={addNow} className="rounded-lg bg-blue-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-400">+ New</button>
      </div>

      {/* Sub bar */}
      <div className="flex shrink-0 items-center gap-3 px-4 py-2">
        <div className="flex rounded-lg border border-neutral-800 bg-neutral-900/80 p-0.5 text-[13px]">
          {(['List', 'Calendar'] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={`rounded-md px-3 py-1 ${view === v ? 'bg-neutral-700/80 text-white' : 'text-neutral-400 hover:text-white'}`}
            >
              {v}
            </button>
          ))}
        </div>
        <div className="flex items-center rounded-lg border border-neutral-800 bg-neutral-900/80 text-[13px]">
          <button onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - 7))} className="px-2 py-1 text-neutral-400 hover:text-white">‹</button>
          <button
            onClick={() => { const n = new Date(); setAnchor(n); setMiniCursor({ y: n.getFullYear(), m: n.getMonth() }) }}
            className="px-2 py-1 text-white"
          >
            Today
          </button>
          <button onClick={() => setAnchor(new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + 7))} className="px-2 py-1 text-neutral-400 hover:text-white">›</button>
        </div>
        <div className="text-[15px] font-medium text-white">{rangeLabel}</div>
        <div className="flex-1" />
        <select value={botFilter} onChange={(e) => setBotFilter(e.target.value)} className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-[13px] text-neutral-200">
          <option value="all">All bots</option>
          {BOTS.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <select defaultValue="week" className="rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-[13px] text-neutral-200">
          <option value="week">Week</option>
        </select>
      </div>

      {/* Awake banner — no animation, instant toggle */}
      <div className="flex shrink-0 items-center gap-2 border-y border-neutral-900 px-4 py-2 text-[13px]">
        <p className="text-neutral-400">
          <span className="font-medium text-neutral-200">Keep this computer awake for routines.</span>{' '}
          Holds it awake for the hour before a routine and while one runs, while plugged in. A closed lid still sleeps.
        </p>
        <div className="flex-1" />
        <button
          role="switch"
          aria-checked={awake}
          onClick={() => {
            const next = !awake
            setAwake(next)
            window.palette.setAwake(next).then((s) => setAwake(s.enabled)).catch(() => setAwake(!next))
          }}
          className={`relative h-6 w-11 shrink-0 rounded-full ${awake ? 'bg-blue-500' : 'bg-neutral-700'}`}
        >
          <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white" style={{ left: awake ? 22 : 2 }} />
        </button>
      </div>

      {draft && (
        <p className="mx-4 mt-2 truncate rounded border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-200">{draft}</p>
      )}

      {tab !== 'Schedule' ? (
        <div className="flex flex-1 items-center justify-center text-sm text-neutral-500">
          {tab === 'Run logs' ? 'No runs yet — scheduled routines will appear here.' : 'Webhooks land later — point an HTTP call at a routine to trigger it.'}
        </div>
      ) : view === 'List' ? (
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {visibleEvents.length === 0 ? (
            <p className="text-sm text-neutral-500">Nothing scheduled this week. Drag the calendar to add an event, or press + New.</p>
          ) : (
            visibleEvents.map((e) => {
              const b = BOTS.find((x) => x.id === e.botId)!
              return (
                <div key={e.id} className="mb-2 flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: b.color }} />
                  <span className="font-medium text-white">{e.title}</span>
                  <span className="text-neutral-500">{b.name} · {e.dayISO} · {formatRange(e.start, e.end)}</span>
                  <div className="flex-1" />
                  <button onClick={() => setEvents((ev) => ev.filter((x) => x.id !== e.id))} className="text-neutral-500 hover:text-red-400">Remove</button>
                </div>
              )
            })
          )}
        </div>
      ) : (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {/* Day header — sticky, macOS style: small weekday + circle date */}
            <div className="sticky top-0 z-20 grid shrink-0 grid-cols-[64px_repeat(7,1fr)] bg-black text-center" style={{ backgroundColor: '#050608', borderBottom: `1px solid ${GRID}` }}>
              <div className="px-1 pb-2 pt-3 text-left text-[10px] text-neutral-500">{tz}</div>
              {days.map((d, i) => {
                const isToday = sameDay(d, now)
                return (
                  <div key={i} className="px-1 pb-2 pt-3" style={{ borderLeft: `1px solid ${GRID_FAINT}`, background: isToday ? TODAY_TINT : 'transparent' }}>
                    <div className="text-[11px] font-medium" style={{ letterSpacing: '0.08em', color: isToday ? TODAY_RED : '#6f7785' }}>{WD_SHORT[i]}</div>
                    <div
                      className="mx-auto mt-1 flex h-8 w-8 items-center justify-center rounded-full text-[17px]"
                      style={isToday ? { background: TODAY_RED, color: '#fff', fontWeight: 600 } : { color: '#f5f7fa' }}
                    >
                      {d.getDate()}
                    </div>
                  </div>
                )
              })}
            </div>
            <div ref={scrollRef} className="grid min-h-0 flex-1 grid-cols-[64px_repeat(7,1fr)] overflow-y-auto">
              <div>
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="relative text-right" style={{ height: HOUR_H, borderBottom: `1px solid ${GRID}` }}>
                    {h > 0 && <span className="text-[10px] text-neutral-600" style={{ position: 'absolute', top: 3, right: 8, lineHeight: '14px', whiteSpace: 'nowrap' }}>{hourLabel(h)}</span>}
                  </div>
                ))}
              </div>
              {days.map((d) => {
                const key = iso(d)
                const isToday = sameDay(d, now)
                const colEvents = visibleEvents.filter((e) => e.dayISO === key)
                const order = [...colEvents].sort((a, b) => a.start - b.start || a.end - b.end)
                const layout = layoutDayEvents(order)
                const byId = new Map(order.map((e, i) => [e.id, layout[i]!]))
                const showDrag = drag && drag.dayISO === key
                const dlo = showDrag ? Math.min(drag.start, drag.cur) : 0
                const dhi = showDrag ? Math.max(drag.start, drag.cur) : 0
                return (
                  <div
                    key={key}
                    data-day={key}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => dropOnDay(d, e)}
                    onPointerDown={(e) => onColPointerDown(d, e)}
                    onPointerMove={(e) => onColPointerMove(d, e)}
                    onPointerUp={(e) => onColPointerUp(d, e)}
                    onPointerCancel={() => setDrag(null)}
                    className="relative"
                    style={{ borderLeft: `1px solid ${GRID}`, background: isToday ? TODAY_TINT : 'transparent', touchAction: 'none', cursor: 'crosshair' }}
                  >
                    {Array.from({ length: 24 }, (_, h) => (
                      <div key={h} className="relative" style={{ height: HOUR_H, borderBottom: `1px solid ${h === 0 ? GRID : GRID}` }}>
                        <div className="absolute inset-x-0" style={{ top: '50%', borderTop: `1px dashed ${GRID_FAINT}` }} />
                      </div>
                    ))}
                    {order.map((e) => {
                      const b = BOTS.find((x) => x.id === e.botId)!
                      const l = byId.get(e.id)!
                      return (
                        <div
                          key={e.id}
                          onPointerDown={(ev) => onEvPointerDown(e, ev)}
                          onPointerMove={(ev) => onEvPointerMove(e, ev)}
                          onPointerUp={() => { setMove(null); downPos.current = null }}
                          onPointerCancel={() => { setMove(null); setResize(null); downPos.current = null }}
                          onClick={(ev) => {
                            ev.stopPropagation()
                            if (movedRef.current) {
                              movedRef.current = false
                              return
                            }
                            openEditor(e)
                          }}
                          className="absolute cursor-pointer overflow-hidden rounded-lg border px-2 py-1 text-white"
                          style={{
                            top: e.start * HOUR_H + 1,
                            height: Math.max(22, (e.end - e.start) * HOUR_H - 2),
                            // Stacked full-width: every overlapping event stays readable,
                            // later lanes stagger right and sit on top.
                            left: 2 + Math.min(l.col, 4) * 12,
                            right: 2,
                            zIndex: l.col + 1,
                            background: `${b.color}33`,
                            borderColor: `${b.color}88`,
                            borderLeft: `3px solid ${b.color}`
                          }}
                        >
                          <div className="truncate text-[12px] font-semibold">{e.title}</div>
                          <div className="truncate text-[11px] opacity-80">◷ {formatRange(e.start, e.end)}</div>
                          {/* Resize handles */}
                          <div
                            onPointerDown={(ev) => onEdgeDown(e, 'top', ev)}
                            onPointerMove={(ev) => onEdgeMove(e, ev)}
                            onPointerUp={() => setResize(null)}
                            onClick={(ev) => ev.stopPropagation()}
                            style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 8, cursor: 'ns-resize', zIndex: 2 }}
                          />
                          <div
                            onPointerDown={(ev) => onEdgeDown(e, 'bottom', ev)}
                            onPointerMove={(ev) => onEdgeMove(e, ev)}
                            onPointerUp={() => setResize(null)}
                            onClick={(ev) => ev.stopPropagation()}
                            style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 8, cursor: 'ns-resize', zIndex: 2 }}
                          />
                        </div>
                      )
                    })}
                    {showDrag && dhi - dlo >= SNAP_MIN && (
                      <div
                        className="pointer-events-none absolute inset-x-1 overflow-hidden rounded-lg border px-2 py-1"
                        style={{
                          top: dlo * HOUR_H + 1,
                          height: Math.max(22, (dhi - dlo) * HOUR_H - 2),
                          background: 'rgba(59,130,246,0.25)',
                          border: '1px dashed rgba(96,165,250,0.9)',
                          color: '#fff'
                        }}
                      >
                        <div className="truncate text-[12px] font-semibold">New Event</div>
                        <div className="truncate text-[11px] opacity-80">{formatRange(Math.min(drag.start, drag.cur), Math.max(drag.start, drag.cur))}</div>
                      </div>
                    )}
                    {showDrag && (
                      <div className="pointer-events-none absolute inset-x-0 z-10 flex items-center" style={{ top: Math.max(0, Math.min(24, drag.live)) * HOUR_H }}>
                        <span className="h-2 w-2 rounded-full" style={{ background: '#60a5fa' }} />
                        <span className="h-px flex-1" style={{ background: '#60a5fa' }} />
                        <span className="rounded px-1.5 py-0.5 text-[10px] font-medium text-white" style={{ background: '#3b82f6' }}>
                          {formatClock(snapHour(drag.live))}
                        </span>
                      </div>
                    )}
                    {isToday && (
                      <div className="pointer-events-none absolute inset-x-0 z-10 flex items-center" style={{ top: nowTop }}>
                        <span className="h-2 w-2 rounded-full" style={{ background: TODAY_RED }} />
                        <span className="h-px flex-1" style={{ background: TODAY_RED, opacity: 0.8 }} />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
      )}
      </div>

      {/* Floating inspector — overlays the grid, neat bordered card */}
      {sel && (
        <div
          role="dialog"
          aria-label="Event details"
          className="absolute z-30 flex w-[360px] flex-col rounded-2xl bg-neutral-950 p-4 shadow-2xl"
          style={{
            top: 148,
            right: 16,
            bottom: 16,
            zIndex: 30,
            overflowY: 'auto',
            boxSizing: 'border-box',
            background: '#0c0e11',
            border: '1px solid #2a303a',
            borderRadius: 16,
            padding: 16,
            boxShadow: '0 24px 64px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.03) inset'
          }}
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold tracking-widest text-neutral-500">EVENT DETAILS</span>
            <button onClick={closeEditor} className="rounded-full px-2 py-0.5 text-[13px] text-neutral-400 hover:bg-neutral-900 hover:text-white">✕</button>
          </div>
          <label className="mt-4 text-[11px] font-semibold tracking-widest text-neutral-500">TITLE</label>
          <input
            autoFocus
            value={sel.title}
            onChange={(e) => updateSel({ title: e.target.value })}
            onKeyDown={(e) => { if (e.key === 'Escape') closeEditor() }}
            onFocus={(e) => { e.currentTarget.style.borderColor = '#3b82f6' }}
            onBlur={(e) => { e.currentTarget.style.borderColor = '#2a303a' }}
            placeholder="Title or Describe Event"
            className="mt-1 w-full rounded-lg bg-neutral-800 px-3 py-2 text-sm text-white outline-none placeholder:text-neutral-500"
            style={{ border: '1px solid #2a303a', borderRadius: 8, outline: 'none', boxSizing: 'border-box' }}
          />
          <label className="mt-4 text-[11px] font-semibold tracking-widest text-neutral-500">SCHEDULE</label>
          <div className="mt-1 rounded-lg bg-neutral-800 px-3 py-2 text-[13px]" style={{ border: '1px solid #2a303a', borderRadius: 8, boxSizing: 'border-box' }}>
            <div className="font-medium text-neutral-200">{selDayLabel}</div>
            <div className="text-[12px] text-neutral-400">{formatRange(sel.start, sel.end)}</div>
            <div className="mt-2 flex items-center gap-2 text-neutral-300">
              <select
                value={sel.start}
                onChange={(e) => {
                  const s = Number(e.target.value)
                  updateSel({ start: s, end: sel.end <= s ? defaultEnd(s) : sel.end })
                }}
                className="rounded bg-neutral-700 px-1 py-1"
              >
                {quarters.map((q) => <option key={q.value} value={q.value}>{q.label}</option>)}
              </select>
              <span className="text-neutral-500">–</span>
              <select
                value={sel.end}
                onChange={(e) => updateSel({ end: Number(e.target.value) })}
                className="rounded bg-neutral-700 px-1 py-1"
              >
                {quarters.filter((q) => q.value > sel.start).map((q) => <option key={q.value} value={q.value}>{q.label}</option>)}
              </select>
            </div>
          </div>
          <label className="mt-4 text-[11px] font-semibold tracking-widest text-neutral-500">BOT</label>
          <div className="mt-1 flex items-center gap-2 rounded-lg bg-neutral-800 px-3 py-2 text-[13px]" style={{ border: '1px solid #2a303a', borderRadius: 8, boxSizing: 'border-box' }}>
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: BOTS.find((x) => x.id === sel.botId)!.color }} />
            <select
              value={sel.botId}
              onChange={(e) => {
                const bot = BOTS.find((x) => x.id === e.target.value)!
                const prev = BOTS.find((x) => x.id === sel.botId)!
                updateSel({ botId: bot.id, title: sel.title === prev.name ? bot.name : sel.title })
              }}
              className="w-full bg-transparent text-neutral-200 outline-none"
            >
              {BOTS.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </div>
          <div className="flex-1" />
          <div className="mt-4 flex items-center justify-between pt-3" style={{ borderTop: '1px solid #2a303a' }}>
            <button onClick={deleteSel} className="rounded-lg px-3 py-1.5 text-[13px] text-red-400 hover:bg-neutral-800">Delete</button>
            <button onClick={closeEditor} className="rounded-lg bg-blue-500 px-4 py-1.5 text-[13px] font-medium text-white hover:bg-blue-400">Done</button>
          </div>
        </div>
      )}
    </div>
  )
}
