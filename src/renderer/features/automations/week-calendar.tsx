import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bell, Cake, Heart, MessageCircle, Send, ShoppingBag, Sun } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { monthLabel } from './dates.js'
import {
  DAY_HEADER_H,
  GUTTER,
  HOUR_FIRST,
  HOUR_LAST,
  ROW_H,
  fanPlacement,
  moveToTopOfSlot,
  parseSlotKey,
  slotAnchor,
  slotFromPoint,
  slotKey,
  weekCardsFor,
  weekDays,
  weekStartFor,
  type CardIcon,
  type Slot,
  type WeekCard,
  type WeekEvent
} from './week-calendar-model.js'
import './week-calendar.css'

const ICONS: Record<CardIcon, LucideIcon> = {
  chat: MessageCircle,
  plane: Send,
  cart: ShoppingBag,
  cake: Cake,
  heart: Heart,
  sun: Sun,
  bell: Bell
}

const WC_COLORS: Record<string, string> = {
  blue: '130 141 235',
  mint: '52 189 144',
  lime: '177 183 74',
  orange: '233 148 64',
  pink: '235 95 125',
  purple: '167 122 245',
  gray: '108 110 120',
  white: '219 220 228'
}

const WC_COLORS_LIGHT: Record<string, string> = {
  blue: '140 153 240',
  mint: '86 205 166',
  lime: '196 201 108',
  orange: '243 168 96',
  pink: '247 130 150',
  purple: '183 149 249',
  gray: '142 143 150',
  white: '228 229 234'
}

const REST_RADIUS = 14
const DRAG_RADIUS = 9
const DRAG_SCALE = 1.38
const CLICK_EPSILON = 6

interface Sim {
  value: number
  v: number
  target: number
  stiffness: number
  damping: number
  delay: number
}

interface CardSim {
  x: Sim
  y: Sim
  r: Sim
  s: Sim
}

interface DragState {
  id: string
  x: number
  y: number
  slot: Slot
  rot: number
  moved: number
}

interface Layout {
  drag: DragState | null
  fan: string | null
  groups: Map<string, string[]>
  slots: Record<string, Slot>
  order: string[]
  width: number
  cardsById: Map<string, WeekCard>
}

export interface Props {
  events: WeekEvent[]
  onOpen(id: string): void
}

function sim(value: number): Sim {
  return { value, v: 0, target: value, stiffness: 380, damping: 26, delay: 0 }
}

function settled(s: Sim): boolean {
  return Math.abs(s.target - s.value) < 0.01 && Math.abs(s.v) < 0.01
}

function stepSim(s: Sim, dt: number): void {
  const delta = s.target - s.value
  if (Math.abs(delta) < 0.01 && Math.abs(s.v) < 0.01) {
    s.value = s.target
    s.v = 0
    return
  }
  const force = s.stiffness * delta - s.damping * s.v
  s.v += force * dt
  s.value += s.v * dt
}

export default function WeekCalendar({ events, onOpen }: Props): React.JSX.Element {
  const [weekStart, setWeekStart] = useState(() => weekStartFor(new Date()))
  const [now, setNow] = useState(() => new Date())
  const days = useMemo(() => weekDays(weekStart), [weekStart])
  const todayKey = weekStartFor(now)

  const mapping = useMemo(() => weekCardsFor(events, days), [events, days])
  const cardsById = useMemo(() => new Map(mapping.cards.map((c) => [c.id, c])), [mapping])

  const [slots, setSlots] = useState<Record<string, Slot>>({})
  const [order, setOrder] = useState<string[]>([])
  const [drag, setDrag] = useState<DragState | null>(null)
  const [fan, setFan] = useState<string | null>(null)
  const [hoverStack, setHoverStack] = useState<string | null>(null)
  const [width, setWidth] = useState(0)

  const slotsRef = useRef<Record<string, Slot>>({})
  const dragRef = useRef<DragState | null>(null)
  const cardEls = useRef(new Map<string, HTMLElement>())
  const sims = useRef(new Map<string, CardSim>())
  const groupsRef = useRef(new Map<string, string[]>())
  const hoverTimer = useRef(0)
  const wakeRef = useRef<() => void>(() => {})
  const gridRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const grp = new Map<string, string[]>()
    for (const id of order) {
      const slot = slots[id]
      if (!slot) continue
      const key = slotKey(slot)
      const list = grp.get(key)
      if (list) list.push(id)
      else grp.set(key, [id])
    }
    groupsRef.current = grp
    slotsRef.current = slots
  }, [order, slots])

  useEffect(() => {
    const map: Record<string, Slot> = {}
    for (const card of mapping.cards) map[card.id] = { day: card.day, hour: card.hour }
    slotsRef.current = map
    setSlots(map)
    const ids = mapping.cards.map((c) => c.id)
    setOrder(ids)
    setFan(null)
    setHoverStack(null)
    setDrag(null)
    sims.current.clear()
  }, [mapping])

  useEffect(() => {
    const el = gridRef.current
    if (!el) return
        const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(el)
    const timer = window.setInterval(() => setNow(new Date()), 30000)
    return () => {
      ro.disconnect()
      window.clearInterval(timer)
    }
  }, [])

  const layoutRef = useRef<Layout>({
    drag: null,
    fan: null,
    groups: groupsRef.current,
    slots,
    order,
    width,
    cardsById
  })
  layoutRef.current = { drag, fan, groups: groupsRef.current, slots, order, width, cardsById: layoutRef.current.cardsById }
  layoutRef.current.cardsById = cardsById

  const computeTargets = useCallback((): void => {
  const L = layoutRef.current
  if (L.width <= 0) return
  for (const [id, anchor] of Object.entries(L.slots)) {
      let cs = sims.current.get(id)
      if (!cs) {
        const a = slotAnchor(anchor.day, anchor.hour, L.width)
        cs = { x: sim(a.x), y: sim(a.y), r: sim(0), s: sim(1) }
        sims.current.set(id, cs)
      }
    }
    const dragId = L.drag?.id ?? null
    const fanKey = L.fan
    for (const [id, slot] of Object.entries(L.slots)) {
      const cs = sims.current.get(id)
      if (!cs) continue
      const a = slotAnchor(slot.day, slot.hour, L.width)
      const skey = slotKey(slot)
      const stack = L.groups.get(skey) ?? []
      const index = stack.indexOf(id)
      const count = stack.length
      const isDrag = dragId === id
      let tx = a.x
      let ty = a.y
      let tr = 0
      let ts = 1
      if (isDrag && L.drag) {
        tx = L.drag.x
        ty = L.drag.y
        tr = L.drag.rot
        ts = DRAG_SCALE
      } else if (fanKey === skey && count > 1) {
        const card = L.cardsById.get(id)
        const radius = count <= 2 ? 34 : 30 + count * 11
        const place = fanPlacement(index, count, card?.seed ?? index * 7, radius)
        tx = a.x + place.x
        ty = a.y + place.y
        tr = place.rotate
        ts = 1.06
        cs.x.delay = cs.y.delay = cs.r.delay = cs.s.delay = index * 0.04
      } else if (count > 1 && index < count - 1) {
        ty = a.y + index * 4
      }
      const stiffness = dragId ? 420 : 380
      const damping = dragId ? 34 : 26
      if (!isDrag) {
        cs.x.stiffness = cs.y.stiffness = stiffness
        cs.x.damping = cs.y.damping = damping
        cs.r.stiffness = dragId ? 260 : 300
        cs.r.damping = dragId ? 18 : 24
        cs.s.stiffness = dragId ? 340 : 320
        cs.s.damping = dragId ? 24 : 22
      }
      if (fanKey !== skey || count <= 1) {
        cs.x.delay = cs.y.delay = cs.r.delay = cs.s.delay = 0
      }
      cs.x.target = tx
      cs.y.target = ty
      cs.r.target = tr
      cs.s.target = ts
    }
  }, [])

  const applyVisuals = useCallback((): void => {
    const L = layoutRef.current
    const dark = !document.documentElement.classList.contains('light')
    for (const [id, cs] of sims.current) {
      const el = cardEls.current.get(id)
      if (!el) continue
      el.style.transform = `translate3d(${cs.x.value}px, ${cs.y.value}px, 0) rotate(${cs.r.value}deg) scale(${cs.s.value})`
      const slot = L.slots[id]
      const skey = slot ? slotKey(slot) : ''
      const stack = slot ? (L.groups.get(skey) ?? []) : []
      const index = stack.indexOf(id)
      const count = stack.length
      const isDrag = L.drag?.id === id
      const isFan = !isDrag && L.fan === skey && count > 1
      const isTop = !isDrag && count > 1 && index === count - 1
      const radius = isDrag ? DRAG_RADIUS : REST_RADIUS
      const shadow = isDrag
        ? '0 28px 56px rgba(0,0,0,0.45), 0 8px 18px rgba(0,0,0,0.28)'
        : isFan
          ? '0 12px 28px rgba(0,0,0,0.28)'
          : '0 4px 12px rgba(0,0,0,0.22)'
      const palette = dark ? WC_COLORS : WC_COLORS_LIGHT
      const card = L.cardsById.get(id)
      const base = card ? palette[card.color] ?? WC_COLORS.gray : '120 120 128'
      const alpha = isDrag ? 0.72 : isTop ? 1 : 0.82
      const bg = `rgb(${base} / ${alpha})`
      const sat = isTop ? 1.35 : 1
      if (el.style.borderRadius !== `${radius}px`) el.style.borderRadius = `${radius}px`
      if (el.style.boxShadow !== shadow) el.style.boxShadow = shadow
      if (el.style.backgroundColor !== bg) el.style.backgroundColor = bg
      if (el.style.filter !== `saturate(${sat})`) el.style.filter = `saturate(${sat})`
      const blur = isDrag ? 'blur(7px)' : 'none'
      if (el.style.backdropFilter !== blur) el.style.backdropFilter = blur
      el.style.zIndex = String(isDrag ? 1000 : isFan ? 100 + index : 10 + index)
    }
  }, [])

  useEffect(() => {
    let running = false
    let last = performance.now()
    const loop = (t: number): void => {
      const dt = Math.min(0.05, (t - last) / 1000)
      last = t
      let busy = !!layoutRef.current.drag
      for (const cs of sims.current.values()) {
        for (const s of [cs.x, cs.y, cs.r, cs.s]) {
          if (s.delay > 0) {
            s.delay = Math.max(0, s.delay - dt)
            busy = true
            if (s.delay > 0) continue
          }
          if (settled(s)) continue
          stepSim(s, dt)
          if (!s.delay) busy = busy || !settled(s)
        }
      }
      applyVisuals()
      if (busy && running) requestAnimationFrame(loop)
      else running = false
    }
    const wake = (): void => {
      if (running) return
      running = true
      last = performance.now()
      requestAnimationFrame(loop)
    }
    wakeRef.current = wake
    wake()
    return () => {
      running = false
    }
  }, [applyVisuals])

  useEffect(() => {
    computeTargets()
    wakeRef.current()
  }, [slots, order, drag, fan, width, computeTargets])

  const beginDrag = useCallback(
    (event: React.PointerEvent, id: string): void => {
      if (event.button !== 0) return
      event.preventDefault()
      const rect = gridRef.current?.getBoundingClientRect()
      const slot = slotsRef.current[id]
      if (!rect || !slot) return
      const a = slotAnchor(slot.day, slot.hour, rect.width)
      const px = event.clientX - rect.left
      const py = event.clientY - rect.top
      const offX = Math.min(a.w, Math.max(0, px - a.x))
      const offY = Math.min(a.h, Math.max(0, py - a.y))
      const d: DragState = { id, x: px - offX, y: py - offY, slot, rot: 0, moved: 0 }
      dragRef.current = d
      setDrag({ ...d })
      setFan(null)
      setHoverStack(null)
      let vel = 0
      let lastT = performance.now()
      let lastX = event.clientX
      let lastY = event.clientY
      let rotTimer = 0

      const move = (e: PointerEvent): void => {
        const cur = dragRef.current
        if (!cur) return
        const rect2 = gridRef.current?.getBoundingClientRect()
        if (!rect2) return
        const t = performance.now()
        vel = vel * 0.65 + ((e.clientX - lastX) / Math.max(8, t - lastT)) * 0.35
        lastT = t
        cur.moved += Math.abs(e.clientX - lastX) + Math.abs(e.clientY - lastY)
        lastX = e.clientX
        lastY = e.clientY
        const relX = e.clientX - rect2.left
        const relY = e.clientY - rect2.top
        cur.x = relX - offX
        cur.y = relY - offY
        cur.rot = Math.min(10, Math.max(-10, vel * 9))
        cur.slot = slotFromPoint(relX, relY, rect2.width)
        setDrag({ ...cur })
        window.clearTimeout(rotTimer)
        rotTimer = window.setTimeout(() => {
          const c = dragRef.current
          if (!c) return
          c.rot = 0
          setDrag({ ...c })
        }, 80)
      }
      const up = (): void => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        window.clearTimeout(rotTimer)
        const c = dragRef.current
        dragRef.current = null
        setDrag(null)
        if (!c) return
        if (c.moved < CLICK_EPSILON) {
          onOpen(c.id)
          return
        }
        setSlots((prev) => ({ ...prev, [c.id]: c.slot }))
        setOrder((prev) => moveToTopOfSlot(prev, c.id, c.slot, { ...slotsRef.current, [c.id]: c.slot }))
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    },
    [onOpen]
  )

  const onStackEnter = useCallback((key: string): void => {
    window.clearTimeout(hoverTimer.current)
    if (dragRef.current) return
    setHoverStack(key)
    setFan(key)
  }, [])

  const onStackLeave = useCallback((): void => {
    hoverTimer.current = window.setTimeout(() => {
      setHoverStack(null)
      setFan(null)
    }, 140)
  }, [])

  const colW = width ? (width - GUTTER) / 7 : 0
  const nowFrac = (now.getHours() * 60 + now.getMinutes()) / 60
  const isCurrentWeek = days.some((d) => d.key === todayKey)
  const showNow = isCurrentWeek && nowFrac >= HOUR_FIRST && nowFrac <= HOUR_LAST
  const nowY = DAY_HEADER_H + (nowFrac - HOUR_FIRST) * ROW_H

  const tooltip = useMemo(() => {
    if (!hoverStack || drag || !width) return null
    const stack = layoutRef.current.groups.get(hoverStack)
    if (!stack || stack.length < 2) return null
    const { day, hour } = parseSlotKey(hoverStack)
    const a = slotAnchor(day, hour, width)
    const card = cardsById.get(stack[stack.length - 1])
    if (!card) return null
    return { x: a.x + a.w / 2, y: a.y - 36, text: card.title }
  }, [hoverStack, drag, width, cardsById])

  const shiftWeek = (delta: number): void =>
    setWeekStart((s) => {
      const d = new Date(`${s}T00:00:00`)
      d.setDate(d.getDate() + delta)
      return weekStartFor(d)
    })

  return (
    <div className="wc" aria-label="Automation week calendar">
      <div className="wc-topbar">
        <button type="button" className="wc-today" onClick={() => setWeekStart(weekStartFor(new Date()))}>Today</button>
        <button type="button" className="wc-nav" aria-label="Previous week" onClick={() => shiftWeek(-7)}>‹</button>
        <button type="button" className="wc-nav" aria-label="Next week" onClick={() => shiftWeek(7)}>›</button>
        <span className="wc-month">{weekTag(days)}</span>
        {mapping.skipped > 0 && (
          <span className="wc-skipped">
            {mapping.skipped} item{mapping.skipped === 1 ? '' : 's'} outside this week
          </span>
        )}
      </div>
      <div ref={gridRef} className="wc-grid">
        {colW > 0 &&
          Array.from({ length: 6 }, (_, i) => i + 1).map((i) => (
            <div key={`sep${i}`} className="wc-colsep" style={{ left: GUTTER + i * colW - 0.5 }} />
          ))}
        {days.map((d, i) => (
          <div key={d.key} className="wc-dayheader" style={{ left: GUTTER + i * colW, width: colW }}>
            <span className="wc-dayname">{d.date.toLocaleDateString([], { weekday: 'short' }).toUpperCase()}</span>
            <span className={`wc-daynum${d.key === todayKey ? ' is-today' : ''}`}>{d.date.getDate()}</span>
          </div>
        ))}
        {Array.from({ length: HOUR_LAST - HOUR_FIRST + 1 }, (_, i) => {
          const hour = HOUR_FIRST + i
          const y = DAY_HEADER_H + i * ROW_H
          return (
            <div key={`h${hour}`}>
              <div className="wc-hourline" style={{ top: y }} />
              <span className="wc-hourlabel" style={{ top: y - 6 }}>{hourFace(hour)}</span>
            </div>
          )
        })}
        {showNow && (
          <>
            <span className="wc-nowpill" style={{ top: nowY - 10 }}>
              {`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`}
            </span>
            <div className="wc-nowline" style={{ top: nowY }} />
          </>
        )}
        {mapping.cards.map((card) => {
          const slot = slots[card.id]
          const skey = slot ? slotKey(slot) : ''
          const stack = layoutRef.current.groups.get(skey) ?? []
          const depth = stack.indexOf(card.id)
          const count = stack.length
          const dragging = drag?.id === card.id
          const Icon = ICONS[card.icon]
          return (
            <button
              key={card.id}
              type="button"
              ref={(el) => {
                if (el) cardEls.current.set(card.id, el)
                else cardEls.current.delete(card.id)
              }}
              data-wc-card={card.id}
              className={`wc-card${dragging ? ' is-drag' : ''}`}
              onPointerDown={(e) => beginDrag(e, card.id)}
              onPointerEnter={() => {
                if (!dragRef.current && count > 1) onStackEnter(skey)
              }}
              onPointerLeave={() => {
                if (count > 1) onStackLeave()
              }}
              aria-label={`${card.title}${slot ? `, ${days[slot.day]?.date.toLocaleDateString([], { weekday: 'long' }) ?? ''} ${hourFaceFull(slot.hour)}` : ''}`}
            >
              <span className="wc-card-inner">
                <span className="wc-card-top">
                  <Icon size={15} strokeWidth={2} color="rgba(30,30,36,0.65)" aria-hidden />
                  <span className="wc-card-dots" aria-hidden>•••</span>
                </span>
                <span className="wc-card-meta">{card.meta}</span>
                <span className="wc-card-title">{card.title}</span>
              </span>
              {count > 1 && depth === count - 1 && !dragging && fan !== skey && (
                <span className="wc-hiddenbadge">{count - 1} hidden</span>
              )}
              {dragging && drag && (
                <span className="wc-draglabel">
                  <span>{`${days[drag.slot.day]?.date.toLocaleDateString([], { weekday: 'short' }) ?? ''} ${hourFaceFull(drag.slot.hour)}`}</span>
                </span>
              )}
            </button>
          )
        })}
        {tooltip && (
          <span className="wc-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>{tooltip.text}</span>
        )}
      </div>
    </div>
  )
}

function hourFace(hour: number): string {
  return `${((hour + 11) % 12) + 1} AM`
}

function hourFaceFull(hour: number): string {
  return `${((hour + 11) % 12) + 1}:00 AM`
}

function weekTag(days: { date: Date }[]): string {
  const a = monthLabel(days[0].date.getFullYear(), days[0].date.getMonth())
  const b = monthLabel(days[6].date.getFullYear(), days[6].date.getMonth())
  return a === b ? a : `${a} – ${b}`
}
