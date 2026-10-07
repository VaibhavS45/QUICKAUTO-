import { useEffect, useMemo, useRef, useState } from 'react'
import '../styles.css'

interface Bot {
  id: string
  name: string
  color: string
}

interface CalEvent {
  id: number
  botId: string
  dayISO: string
  hour: number
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
const HOUR_H = 64
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
/** Monday-first 42-cell month grid. */
function monthCells(y: number, m: number): Date[] {
  const first = new Date(y, m, 1)
  const off = (first.getDay() + 6) % 7
  return Array.from({ length: 42 }, (_, i) => new Date(y, m, 1 - off + i))
}
function hourLabel(h: number): string {
  if (h === 0) return '12 AM'
  if (h < 12) return `${h} AM`
  if (h === 12) return '12 PM'
  return `${h - 12} PM`
}

/** Automations schedule — first window. Native frame gives drag/resize/title. */
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
  const [isMac, setIsMac] = useState(false)
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
    const off = window.palette.onCalendarDraft((text) => setDraft(text))
    const onUnload = (): void => window.palette.calendarWindowEvent('closed')
    window.addEventListener('beforeunload', onUnload)
    void window.palette.platformInfo().then((p: { platform: string }) => setIsMac(p.platform === 'darwin')).catch(() => {})
    return () => {
      off()
      window.removeEventListener('beforeunload', onUnload)
      window.palette.calendarWindowEvent('closed')
    }
  }, [])

  // Start scrolled near 1 PM like the reference shot.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 13 * HOUR_H })
  }, [])

  const visibleEvents = events.filter((e) => botFilter === 'all' || e.botId === botFilter)
  const botsShown = BOTS.filter((b) => b.name.toLowerCase().includes(query.toLowerCase()))
  const rangeLabel = `${MONTHS[days[0]!.getMonth()]} ${days[0]!.getDate()} – ${days[6]!.getDate()}, ${days[6]!.getFullYear()}`
  const nowTop = (now.getHours() + now.getMinutes() / 60) * HOUR_H

  function dropOnDay(day: Date, e: React.DragEvent): void {
    e.preventDefault()
    const botId = e.dataTransfer.getData('text/bot')
    if (!BOTS.some((b) => b.id === botId)) return
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
    const hour = Math.max(0, Math.min(23.5, Math.floor(((e.clientY - rect.top) / HOUR_H) * 2) / 2))
    setEvents((ev) => [...ev, { id: nextId++, botId, dayISO: iso(day), hour }])
  }

  function addNow(): void {
    const h = new Date().getHours()
    const botId = botFilter !== 'all' ? botFilter : BOTS[0]!.id
    setEvents((ev) => [...ev, { id: nextId++, botId, dayISO: iso(anchor), hour: h }])
  }

  const miniCells = useMemo(() => monthCells(miniCursor.y, miniCursor.m), [miniCursor])
  const stepMini = (d: number): void => {
    const n = new Date(miniCursor.y, miniCursor.m + d, 1)
    setMiniCursor({ y: n.getFullYear(), m: n.getMonth() })
  }

  return (
    <div className="flex h-screen flex-col bg-black text-neutral-200 select-none">
      {/* Top bar — window drag region (frameless window, no title bar) */}
      <div
        className={`window-titlebar flex shrink-0 items-center gap-3 px-4 pt-3 ${isMac ? 'pl-[76px]' : ''}`}
      >
        <button title="Back" className="rounded-lg border border-neutral-800 px-2.5 py-1.5 text-neutral-300 hover:bg-neutral-900">←</button>
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
      <div className="flex shrink-0 items-center gap-3 px-4 py-3">
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

      {/* Awake banner */}
      <div className="flex shrink-0 items-center gap-2 border-y border-neutral-900 px-4 py-2 text-[13px]">
        <p className="text-neutral-400">
          <span className="font-medium text-neutral-200">Keep this computer awake for routines.</span>{' '}
          Holds it awake for the hour before a routine and while one runs, while plugged in. A closed lid still sleeps.
        </p>
        <div className="flex-1" />
        <button
          role="switch"
          aria-checked={awake}
          onClick={() => setAwake((a) => !a)}
          className={`relative h-6 w-11 shrink-0 rounded-full transition ${awake ? 'bg-blue-500' : 'bg-neutral-700'}`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${awake ? 'left-[22px]' : 'left-0.5'}`} />
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
            <p className="text-sm text-neutral-500">Nothing scheduled this week. Drag a bot onto the calendar, or press + New.</p>
          ) : (
            visibleEvents.map((e) => {
              const b = BOTS.find((x) => x.id === e.botId)!
              return (
                <div key={e.id} className="mb-2 flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: b.color }} />
                  <span className="font-medium text-white">{b.name}</span>
                  <span className="text-neutral-500">{e.dayISO} · {hourLabel(Math.floor(e.hour))}</span>
                  <div className="flex-1" />
                  <button onClick={() => setEvents((ev) => ev.filter((x) => x.id !== e.id))} className="text-neutral-500 hover:text-red-400">Remove</button>
                </div>
              )
            })
          )}
        </div>
      ) : (
        <div className="flex min-h-0 flex-1">
          {/* Sidebar */}
          <aside className="flex w-[280px] shrink-0 flex-col border-r border-neutral-900 px-4 py-3">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-neutral-300">{MONTHS[miniCursor.m]} {miniCursor.y}</span>
              <div className="flex gap-1 text-neutral-400">
                <button onClick={() => stepMini(-1)} className="rounded px-1.5 hover:bg-neutral-900 hover:text-white">‹</button>
                <button onClick={() => stepMini(1)} className="rounded px-1.5 hover:bg-neutral-900 hover:text-white">›</button>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-7 text-center text-[11px] text-neutral-500">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => <div key={i} className="py-0.5">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 text-center text-[12px]">
              {miniCells.map((d, i) => {
                const inMonth = d.getMonth() === miniCursor.m
                const isToday = sameDay(d, now)
                const isSel = sameDay(d, anchor)
                return (
                  <button
                    key={i}
                    onClick={() => { setAnchor(d); setMiniCursor({ y: d.getFullYear(), m: d.getMonth() }) }}
                    className={`mx-auto my-0.5 flex h-6 w-6 items-center justify-center rounded-full ${
                      isToday ? 'bg-blue-500 font-semibold text-white'
                      : isSel ? 'bg-neutral-800 text-white'
                      : inMonth ? 'text-neutral-300 hover:bg-neutral-900' : 'text-neutral-700 hover:bg-neutral-900'
                    }`}
                  >
                    {d.getDate()}
                  </button>
                )
              })}
            </div>
            <div className="mt-4 flex items-center border-t border-neutral-900 pt-3 text-[11px] font-semibold tracking-widest text-neutral-400">
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
            <div className="mt-1">
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
            <p className="text-[11px] text-neutral-600">Drag a bot onto any time to schedule it.</p>
          </aside>

          {/* Week grid */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="grid shrink-0 grid-cols-[64px_repeat(7,1fr)] border-b border-neutral-900 text-center">
              <div className="px-1 py-2 text-left text-[10px] text-neutral-600">{tz}</div>
              {days.map((d, i) => {
                const isToday = sameDay(d, now)
                return (
                  <div key={i} className={`border-l border-neutral-900 py-2 ${isToday ? 'bg-blue-500/[0.07]' : ''}`}>
                    <div className={`text-[10px] tracking-widest ${isToday ? 'text-blue-400' : 'text-neutral-500'}`}>{WD_SHORT[i]}</div>
                    <div className={`mx-auto mt-1 flex h-8 w-8 items-center justify-center rounded-full text-[15px] ${isToday ? 'bg-blue-500 font-semibold text-white' : 'text-white'}`}>
                      {d.getDate()}
                    </div>
                  </div>
                )
              })}
            </div>
            <div ref={scrollRef} className="grid min-h-0 flex-1 grid-cols-[64px_repeat(7,1fr)] overflow-y-auto">
              <div>
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="relative border-b border-neutral-900/60 text-right" style={{ height: HOUR_H }}>
                    {h > 0 && <span className="absolute -top-2 right-2 text-[10px] text-neutral-600">{hourLabel(h)}</span>}
                  </div>
                ))}
              </div>
              {days.map((d, i) => {
                const isToday = sameDay(d, now)
                const colEvents = visibleEvents.filter((e) => e.dayISO === iso(d))
                return (
                  <div
                    key={i}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => dropOnDay(d, e)}
                    className={`relative border-l border-neutral-900/80 ${isToday ? 'bg-blue-500/[0.07]' : ''}`}
                  >
                    {Array.from({ length: 24 }, (_, h) => (
                      <div key={h} className="border-b border-neutral-900/60" style={{ height: HOUR_H }} />
                    ))}
                    {colEvents.map((e) => {
                      const b = BOTS.find((x) => x.id === e.botId)!
                      return (
                        <div
                          key={e.id}
                          title={`${b.name} · ${hourLabel(Math.floor(e.hour))}`}
                          className="absolute inset-x-1 rounded-md border px-2 py-1 text-[11px] font-medium text-white"
                          style={{ top: e.hour * HOUR_H + 2, height: HOUR_H - 4, background: `${b.color}33`, borderColor: `${b.color}66` }}
                        >
                          {b.name}
                        </div>
                      )
                    })}
                    {isToday && (
                      <div className="pointer-events-none absolute inset-x-0 z-10 flex items-center" style={{ top: nowTop }}>
                        <span className="h-2 w-2 rounded-full bg-red-400" />
                        <span className="h-px flex-1 bg-red-400/80" />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
