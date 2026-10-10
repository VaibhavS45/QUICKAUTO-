import { cn } from './cn.js'

/** Pure class map (unit-tested). Token-backed track. */
export function switchClass(on: boolean): string {
  return cn(
    'relative h-5 w-9 shrink-0 rounded-full p-0.5 transition-colors focus-visible:ring-2 focus-visible:ring-ring/50',
    on ? 'bg-primary' : 'bg-input'
  )
}

export function switchThumbClass(on: boolean): string {
  return cn(
    'block h-4 w-4 rounded-full transition-transform',
    on ? 'translate-x-4 bg-primary-foreground' : 'translate-x-0 bg-foreground'
  )
}

export function Switch({
  checked,
  onCheckedChange,
  label
}: {
  checked: boolean
  onCheckedChange: (next: boolean) => void
  label: string
}): React.JSX.Element {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onCheckedChange(!checked)}
      className={switchClass(checked)}
    >
      <span className={switchThumbClass(checked)} />
    </button>
  )
}
