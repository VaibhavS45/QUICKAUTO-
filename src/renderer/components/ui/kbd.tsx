import type { HTMLAttributes } from 'react'
import { cn } from './cn.js'

export function kbdClass(className?: string): string {
  return cn(
    'rounded border border-neutral-700 bg-neutral-800/80 px-1 py-px font-mono text-[10px] text-neutral-400',
    className
  )
}

export function Kbd({ className, ...rest }: HTMLAttributes<HTMLElement>): React.JSX.Element {
  return <kbd className={kbdClass(className)} {...rest} />
}
