import { cn } from './cn.js'

export function separatorClass(className?: string): string {
  return cn('h-px w-full bg-neutral-800', className)
}

export function Separator({ className }: { className?: string }): React.JSX.Element {
  return <div role="separator" className={separatorClass(className)} />
}
