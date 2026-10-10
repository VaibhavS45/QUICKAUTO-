import type { HTMLAttributes } from 'react'
import { cn } from './cn.js'

export function kbdClass(className?: string): string {
  return cn(
    'rounded border border-border bg-muted px-1 py-px font-mono text-[10px] text-muted-foreground',
    className
  )
}

export function Kbd({ className, ...rest }: HTMLAttributes<HTMLElement>): React.JSX.Element {
  return <kbd className={kbdClass(className)} {...rest} />
}
