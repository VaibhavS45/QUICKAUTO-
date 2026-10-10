import { cn } from './cn.js'

/** Pure class map (unit-tested). Cursor-sized track. */
export function switchClass(on: boolean): string {
  return cn(
    'relative h-5 w-9 shrink-0 rounded-full p-0.5 transition-colors',
    on ? 'bg-blue-500' : 'bg-neutral-700'
  )
}

export function switchThumbClass(on: boolean): string {
  return cn('block h-4 w-4 rounded-full bg-white transition-transform', on ? 'translate-x-4' : 'translate-x-0')
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
