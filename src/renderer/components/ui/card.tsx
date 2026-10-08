import type { HTMLAttributes } from 'react'
import { cn } from './cn.js'

/** Pure class map (unit-tested). Keeps the previous settings card shell. */
export function cardClass(className?: string): string {
  return cn('rounded-xl border border-neutral-800 bg-neutral-900 p-4', className)
}

export function Card({ className, ...rest }: HTMLAttributes<HTMLElement>): React.JSX.Element {
  return <section className={cardClass(className)} {...rest} />
}

export function CardTitle({ className, ...rest }: HTMLAttributes<HTMLHeadingElement>): React.JSX.Element {
  return <h3 className={cn('text-sm font-semibold text-neutral-100', className)} {...rest} />
}

export function CardSub({ className, ...rest }: HTMLAttributes<HTMLParagraphElement>): React.JSX.Element {
  return <p className={cn('pt-0.5 text-xs text-neutral-400', className)} {...rest} />
}

export function Hint({ className, ...rest }: HTMLAttributes<HTMLParagraphElement>): React.JSX.Element {
  return <p className={cn('pt-1 text-xs leading-relaxed text-neutral-400', className)} {...rest} />
}
