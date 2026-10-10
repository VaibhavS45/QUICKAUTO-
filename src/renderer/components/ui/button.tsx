import type { ButtonHTMLAttributes } from 'react'
import { cn } from './cn.js'

export type ButtonVariant = 'default' | 'secondary' | 'destructive' | 'success' | 'ghost'
export type ButtonSize = 'sm' | 'md' | 'icon'

/** Pure class map (unit-tested). Rounding lives in sizes so base never conflicts. */
export function buttonClass(variant: ButtonVariant = 'default', size: ButtonSize = 'md'): string {
  const base = 'font-medium outline-none disabled:opacity-50'
  const sizes: Record<ButtonSize, string> = {
    sm: 'rounded-md px-2.5 py-1 text-xs',
    md: 'h-9 rounded-md px-4 text-sm',
    icon: 'rounded px-1.5 py-0.5 text-sm'
  }
  const variants: Record<ButtonVariant, string> = {
    default: 'bg-blue-500 text-white hover:bg-blue-400',
    secondary: 'border border-neutral-700 text-neutral-300 hover:text-neutral-100',
    destructive: 'bg-red-700 text-white',
    success: 'bg-emerald-600 text-white',
    ghost: 'text-neutral-500 hover:text-neutral-200'
  }
  return cn(base, sizes[size], variants[variant])
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

export function Button({ variant = 'default', size = 'md', className, type, ...rest }: ButtonProps): React.JSX.Element {
  return <button type={type ?? 'button'} className={cn(buttonClass(variant, size), className)} {...rest} />
}
