import { cn } from './cn.js'

export function separatorClass(className?: string): string {
  return cn('h-px w-full bg-border', className)
}

export function Separator({ className }: { className?: string }): React.JSX.Element {
  return <div role="separator" className={separatorClass(className)} />
}
