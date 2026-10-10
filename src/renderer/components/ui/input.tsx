import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { cn } from './cn.js'

const base =
  'w-full rounded-md border border-input bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50'

/** Pure class map (unit-tested). Same shell + mono pattern the settings used. */
export function inputClass(monospace = false, className?: string): string {
  return cn(base, monospace && 'font-mono text-xs', className)
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  monospace?: boolean
}

export function Input({ monospace = false, className, ...rest }: InputProps): React.JSX.Element {
  return <input className={cn(base, 'h-9 px-3', monospace && 'font-mono text-xs', className)} {...rest} />
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  monospace?: boolean
}

export function Textarea({ monospace = false, className, ...rest }: TextareaProps): React.JSX.Element {
  return <textarea className={cn(base, 'min-h-24 resize-y px-3 py-2', monospace && 'font-mono text-xs', className)} {...rest} />
}

export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>): React.JSX.Element {
  return <select className={cn(base, 'h-9 px-3', className)} {...rest} />
}
