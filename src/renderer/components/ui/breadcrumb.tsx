import type { ComponentProps } from 'react'
import { ChevronRight, MoreHorizontal } from 'lucide-react'
import { cn } from '../../lib/utils.js'

/**
 * shadcn/ui breadcrumb (new-york) ported to this app's conventions.
 * Source: https://ui.shadcn.com/docs/components/breadcrumb
 * ponytail: no @radix-ui/react-slot (not a dependency) — no `asChild` support.
 */
export function Breadcrumb({ className, ...props }: ComponentProps<'nav'>): React.JSX.Element {
  return <nav aria-label="breadcrumb" className={cn(className)} {...props} />
}

export function BreadcrumbList({ className, ...props }: ComponentProps<'ol'>): React.JSX.Element {
  return (
    <ol
      className={cn(
        'flex flex-wrap items-center gap-1.5 break-words text-sm text-muted-foreground sm:gap-2.5',
        className
      )}
      {...props}
    />
  )
}

export function BreadcrumbItem({ className, ...props }: ComponentProps<'li'>): React.JSX.Element {
  return <li className={cn('inline-flex items-center gap-1.5', className)} {...props} />
}

export function BreadcrumbLink({ className, ...props }: ComponentProps<'a'>): React.JSX.Element {
  return <a className={cn('transition-colors hover:text-foreground', className)} {...props} />
}

export function BreadcrumbPage({ className, ...props }: ComponentProps<'span'>): React.JSX.Element {
  return (
    <span
      role="link"
      aria-disabled="true"
      aria-current="page"
      className={cn('font-normal text-foreground', className)}
      {...props}
    />
  )
}

export function BreadcrumbSeparator({ children, className, ...props }: ComponentProps<'li'>): React.JSX.Element {
  return (
    <li
      role="presentation"
      aria-hidden="true"
      className={cn('[&>svg]:h-3.5 [&>svg]:w-3.5', className)}
      {...props}
    >
      {children ?? <ChevronRight />}
    </li>
  )
}

export function BreadcrumbEllipsis({ className, ...props }: ComponentProps<'span'>): React.JSX.Element {
  return (
    <span
      role="presentation"
      aria-hidden="true"
      className={cn('flex h-9 w-9 items-center justify-center', className)}
      {...props}
    >
      <MoreHorizontal className="h-4 w-4" />
      <span className="sr-only">More</span>
    </span>
  )
}
