import type { HTMLAttributes } from 'react'
import { cn } from './cn.js'

export type BadgeVariant = 'tool' | 'ok' | 'mute' | 'busy' | 'alert' | 'bad'

/** Pure class map (unit-tested). Matches the previous raw chip classes. */
export function badgeClass(variant: BadgeVariant = 'mute', pill = false): string {
  const base = 'font-mono text-xs'
  const shape = pill ? 'rounded-full px-2.5 py-0.5' : 'rounded px-1.5 py-0.5'
  const variants: Record<BadgeVariant, string> = {
    tool: 'bg-indigo-600/30 text-indigo-200',
    ok: 'bg-emerald-700/30 text-emerald-200',
    mute: 'bg-neutral-800 text-neutral-400',
    busy: 'bg-amber-600/30 text-amber-200',
    alert: 'bg-orange-600/40 text-orange-100',
    bad: 'bg-red-800/50 text-red-200'
  }
  return cn(base, shape, variants[variant])
}

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
  pill?: boolean
}

export function Badge({ variant = 'mute', pill = false, className, ...rest }: BadgeProps): React.JSX.Element {
  return <span className={cn(badgeClass(variant, pill), className)} {...rest} />
}
