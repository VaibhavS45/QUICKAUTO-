import type { HTMLAttributes } from 'react'
import { cn } from './cn.js'

/** Pure class map (unit-tested). Token-backed card shell. */
export function cardClass(className?: string): string {
  return cn('rounded-xl border bg-card text-card-foreground shadow-sm p-4', className)
}

export function Card({ className, ...rest }: HTMLAttributes<HTMLElement>): React.JSX.Element {
  return <section className={cardClass(className)} {...rest} />
}

export function CardHeader({ className, ...rest }: HTMLAttributes<HTMLElement>): React.JSX.Element {
  return <div className={cn('flex flex-col gap-1.5', className)} {...rest} />
}

export function CardTitle({ className, ...rest }: HTMLAttributes<HTMLHeadingElement>): React.JSX.Element {
  return <h3 className={cn('text-sm font-semibold leading-none tracking-tight', className)} {...rest} />
}

export function CardDescription({ className, ...rest }: HTMLAttributes<HTMLParagraphElement>): React.JSX.Element {
  return <p className={cn('pt-0.5 text-xs text-muted-foreground', className)} {...rest} />
}

export function CardContent({ className, ...rest }: HTMLAttributes<HTMLElement>): React.JSX.Element {
  return <div className={cn('pt-3', className)} {...rest} />
}

export function CardFooter({ className, ...rest }: HTMLAttributes<HTMLElement>): React.JSX.Element {
  return <div className={cn('flex items-center gap-2 pt-3', className)} {...rest} />
}

/** @deprecated use CardDescription; kept for existing settings callers. */
export function CardSub({ className, ...rest }: HTMLAttributes<HTMLParagraphElement>): React.JSX.Element {
  return <CardDescription className={className} {...rest} />
}

export function Hint({ className, ...rest }: HTMLAttributes<HTMLParagraphElement>): React.JSX.Element {
  return <p className={cn('pt-1 text-xs leading-relaxed text-muted-foreground', className)} {...rest} />
}
