import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  Bell,
  Cake,
  ChevronLeft,
  ChevronRight,
  Heart,
  List,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  ShoppingBag,
  SlidersHorizontal,
  Sun,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import {
  BOTTOM_PAD,
  COLORS,
  DAYS,
  DAY_HEADER_H,
  formatSlot,
  GUTTER,
  HOUR_END,
  HOUR_START,
  INITIAL_EVENTS,
  ROW_H,
  slotAnchor,
} from './week'
import type { EventInstance, IconName } from './week'

const ICONS: Record<IconName, LucideIcon> = {
  chat: MessageCircle,
  plane: Send,
  cart: ShoppingBag,
  cake: Cake,
  heart: Heart,
  sun: Sun,
  bell: Bell,
}

const DRAG_SCALE = 1.38
const DRAG_RADIUS = 9
const REST_RADIUS = 14

interface DragState {
  id: string
  x: number
  y: number
  day: number
  hour: number
  rot: number
}

type FanSlot = string | null

const slotKey = (day: number, hour: number) => `${day}-${hour}`

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v))

const spring = (stiffness: number, damping: number) => ({
  type: 'spring' as const,
  stiffness,
  damping,
})

export function CalendarWeek() {
  const [events, setEvents] = useState<EventInstance[]>(INITIAL_EVENTS)
  const [drag, setDrag] = useState<DragState | null>(null)
  const [fan, setFan] = useState<FanSlot>(null)
  const [hoverStack, setHoverStack] = useState<FanSlot>(null)
  const [width, setWidth] = useState(0)

  const gridRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<DragState | null>(null)
  const velRef = useRef(0)
  const lastPtr = useRef<{ x: number; y: number; t: number } | null>(null)
  const rotTimer = useRef<number | undefined>(undefined)
  const hoverTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    const el = gridRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const groups = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const e of events) {
      const k = slotKey(e.day, e.hour)
      const list = map.get(k)
      if (list) list.push(e.id)
      else map.set(k, [e.id])
    }
    return map
  }, [events])

  const depthOf = (id: string): { i: number; k: number; key: string | null } => {
    const e = events.find((ev) => ev.id === id)!
    const key = slotKey(e.day, e.hour)
    const list = groups.get(key) ?? []
    return { i: list.indexOf(id), k: list.length, key }
  }

  const beginDrag = useCallback(
    (e: React.PointerEvent, id: string) => {
      e.preventDefault()
      if (dragRef.current) return
      const inst = events.find((ev) => ev.id === id)!
      const rect = gridRef.current!.getBoundingClientRect()
      const a = slotAnchor(inst.day, inst.hour, rect.width)
      const px = e.clientX - rect.left
      const py = e.clientY - rect.top
      const offX = clamp(px - a.x, 0, a.w)
      const offY = clamp(py - a.y, 0, a.h)
      velRef.current = 0
      lastPtr.current = { x: e.clientX, y: e.clientY, t: performance.now() }
      const st: DragState = {
        id,
        x: px - offX,
        y: py - offY,
        day: inst.day,
        hour: inst.hour,
        rot: 0,
      }
      dragRef.current = st
      setDrag(st)
      setFan(null)
      setHoverStack(null)

      const onMove = (ev: PointerEvent) => {
        const now = performance.now()
        const last = lastPtr.current!
        const dt = Math.max(8, now - last.t)
        const vx = (ev.clientX - last.x) / dt
        velRef.current = velRef.current * 0.65 + vx * 0.35
        lastPtr.current = { x: ev.clientX, y: ev.clientY, t: now }
        const r = gridRef.current!.getBoundingClientRect()
        const relX = ev.clientX - r.left
        const relY = ev.clientY - r.top
        const day = clamp(Math.floor((relX - GUTTER) / ((r.width - GUTTER) / 7)), 0, 6)
        const hour =
          clamp(Math.floor((relY - DAY_HEADER_H) / ROW_H), 0, HOUR_END - HOUR_START - 1) +
          HOUR_START
        const rot = clamp(velRef.current * 9, -10, 10)
        const next: DragState = {
          ...dragRef.current!,
          x: relX - offX,
          y: relY - offY,
          day,
          hour,
          rot,
        }
        dragRef.current = next
        setDrag(next)
        window.clearTimeout(rotTimer.current)
        rotTimer.current = window.setTimeout(() => {
          const cur = dragRef.current
          if (cur && cur.rot !== 0) {
            const settled = { ...cur, rot: 0 }
            dragRef.current = settled
            setDrag(settled)
          }
        }, 80)
      }

      const onUp = () => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.clearTimeout(rotTimer.current)
        const cur = dragRef.current
        dragRef.current = null
        setDrag(null)
        if (!cur) return
        const targetId = events.find((ev) => ev.id === cur.id)!
        setEvents((prev) => {
          const rest = prev.filter((ev) => ev.id !== cur.id)
          const moved = {
            ...targetId,
            day: cur.day,
            hour: cur.hour,
          }
          return [...rest, moved]
        })
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
    },
    [events, groups],
  )

  const onStackEnter = useCallback((key: string) => {
    window.clearTimeout(hoverTimer.current)
    if (dragRef.current) return
    setHoverStack(key)
    setFan(key)
  }, [])

  const onStackLeave = useCallback(() => {
    hoverTimer.current = window.setTimeout(() => {
      setHoverStack(null)
      setFan(null)
    }, 140)
  }, [])

  const nowY = DAY_HEADER_H + ((6 * 60 + 21) / 60 - HOUR_START) * ROW_H
  const colW = width ? (width - GUTTER) / 7 : 0
  const gridH = DAY_HEADER_H + (HOUR_END - HOUR_START) * ROW_H + BOTTOM_PAD

  const tooltip =
    hoverStack && !drag
      ? (() => {
          const list = groups.get(hoverStack)
          if (!list || list.length < 2 || !width) return null
          const [day, hour] = hoverStack.split('-').map(Number)
          const a = slotAnchor(day, hour, width)
          const top = events.find((e) => e.id === list[list.length - 1])!
          return {
            key: hoverStack,
            x: a.x + a.w / 2,
            y: a.y - 36,
            text: top.title,
          }
        })()
      : null

  const rendered = events.map((e) => {
    const key = slotKey(e.day, e.hour)
    const { i, k } = depthOf(e.id)
    const a = width ? slotAnchor(e.day, e.hour, width) : null
    if (!a) return null

    const dragging = drag?.id === e.id
    const fanned = !!fan && fan === key && k > 1 && !drag

    let x = a.x
    let y = a.y
    let rotate = 0
    let scale = 1
    let radius = REST_RADIUS
    let z = 10 + i
    let stagger = 0
    let interactive = true
    let alpha = 0.74
    let saturate = 1
    let shadow: string = '0 3px 10px rgba(18,18,24,0.10)'
    let blurBg = 'blur(0px)'

    if (dragging && drag) {
      x = drag.x
      y = drag.y
      rotate = drag.rot
      scale = DRAG_SCALE
      radius = DRAG_RADIUS
      z = 1000
      alpha = 0.62
      saturate = 1.1
      blurBg = 'blur(7px)'
      shadow = '0 28px 56px rgba(16,16,24,0.28), 0 8px 18px rgba(16,16,24,0.16)'
    } else if (fanned) {
      const t = k === 1 ? 0.5 : i / (k - 1)
      const theta = ((-115 + t * 230) * Math.PI) / 180
      const r = k <= 2 ? 34 : 30 + k * 11
      x = a.x + Math.cos(theta) * r
      y = a.y + Math.sin(theta) * r * 0.82
      rotate = ((e.seed * 53) % 51) - 25
      scale = 1.06
      z = 100 + i
      stagger = i * 0.04
      shadow = '0 12px 28px rgba(18,18,24,0.16)'
    } else if (k > 1 && i < k - 1) {
      y = a.y + i * 4
      interactive = false
    } else if (k > 1) {
      saturate = 1.7
      alpha = 0.92
    }

    const [r0, g0, b0] = COLORS[e.color]
    const fill = `rgb(${r0} ${g0} ${b0} / ${alpha})`

    const transition = dragging
      ? {
          x: spring(420, 34),
          y: spring(420, 34),
          rotate: spring(260, 18),
          scale: spring(340, 24),
          borderRadius: { duration: 0.15 },
        }
      : {
          ...spring(380, 26),
          ...(stagger ? { delay: stagger } : {}),
        }

    return (
      <motion.div
        key={e.id}
        className="jw-card"
        style={{ zIndex: z, width: a.w, height: a.h }}
        initial={false}
        onPointerDown={
          interactive && !drag ? (ev) => beginDrag(ev, e.id) : undefined
        }
        onPointerEnter={
          interactive && !drag && k > 1
            ? () => onStackEnter(key)
            : undefined
        }
        onPointerLeave={
          interactive && !drag && k > 1 ? onStackLeave : undefined
        }
        animate={{
          x,
          y,
          rotate,
          scale,
          borderRadius: radius,
          filter: `saturate(${saturate})`,
          boxShadow: shadow,
          backgroundColor: fill,
          backdropFilter: blurBg,
        }}
        transition={transition}
      >
        <motion.div
          className="jw-card-inner"
          animate={{
            filter: dragging ? 'blur(7px)' : 'blur(0px)',
            opacity: dragging ? 0.3 : 1,
          }}
          transition={{ duration: 0.18 }}
          style={{ borderRadius: 'inherit' }}
        >
          <div className="jw-card-top">
            {(() => {
              const Ic = ICONS[e.icon]
              return <Ic size={15} strokeWidth={2} color="rgba(40,40,46,0.6)" />
            })()}
            <MoreHorizontal size={15} className="jw-card-dots" />
          </div>
          <div className="jw-card-meta">{e.meta}</div>
          <div className="jw-card-title">{e.title}</div>
          {k > 1 && i === k - 1 && !dragging && !fanned && (
            <motion.div
              className="jw-hiddenbadge"
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 400, damping: 22 }}
            >
              {k - 1} hidden
            </motion.div>
          )}
        </motion.div>
        {dragging && drag && (
          <motion.div
            className="jw-draglabel"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.16 }}
          >
            <span>{formatSlot(drag.day, drag.hour)}</span>
          </motion.div>
        )}
      </motion.div>
    )
  })

  return (
    <div className="jw-page">
      <div className="jw-panel">
        <div className="jw-topbar">
          <button className="jw-today-btn">Today</button>
          <button className="jw-navbtn" aria-label="previous week">
            <ChevronLeft size={17} />
          </button>
          <button className="jw-navbtn" aria-label="next week">
            <ChevronRight size={17} />
          </button>
          <div className="jw-month">Aug 2026</div>
          <div className="jw-topbar-right">
            <button className="jw-actionbtn" aria-label="list">
              <List size={16.5} />
            </button>
            <button className="jw-actionbtn" aria-label="search">
              <Search size={16.5} />
            </button>
            <button className="jw-actionbtn" aria-label="filter">
              <SlidersHorizontal size={16.5} />
            </button>
            <button className="jw-actionbtn" aria-label="new event">
              <Plus size={17} style={{ color: '#44444a' }} />
            </button>
          </div>
        </div>
        <div className="jw-grid" style={{ height: gridH }} ref={gridRef}>
          {DAYS.map((d, idx) => (
            <div
              key={d.short}
              className="jw-dayheader"
              style={{ left: GUTTER + idx * colW, width: colW }}
            >
              <div className="jw-dayname">{d.short}</div>
              <div className={`jw-daynum${d.today ? ' today' : ''}`}>
                {d.date}
              </div>
            </div>
          ))}
          {width > 0 &&
            DAYS.slice(1).map((_, idx) => (
              <div
                key={`sep${idx}`}
                className="jw-colsep"
                style={{ left: GUTTER + (idx + 1) * colW - 0.5 }}
              />
            ))}
          {width > 0 &&
            Array.from({ length: HOUR_END - HOUR_START + 1 }, (_, idx) => {
              const hour = HOUR_START + idx
              const y = DAY_HEADER_H + idx * ROW_H
              return (
                <div key={`h${hour}`}>
                  <div className="jw-hourline" style={{ top: y }} />
                  <div className="jw-hourlabel" style={{ top: y - 6 }}>
                    {`${((hour + 11) % 12) + 1} AM`}
                  </div>
                </div>
              )
            })}
          {width > 0 && (
            <>
              <div
                className="jw-nowpill"
                style={{ top: nowY - 10, left: 8 }}
              >
                06:21
              </div>
              <div
                className="jw-nowline"
                style={{ top: nowY, left: 56, right: 0 }}
              />
            </>
          )}
          {rendered}
          {tooltip && (
            <div
              className="jw-tooltip"
              style={{ left: tooltip.x, top: tooltip.y }}
            >
              {tooltip.text}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
