import type { ButtonHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from './cn.js'

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-border',
        destructive: 'bg-destructive text-white hover:bg-destructive/90',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        ghost: 'hover:bg-accent hover:text-accent-foreground text-muted-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
        /** @deprecated use default + an icon instead; kept for stored callers. */
        success: 'bg-emerald-600 text-white hover:bg-emerald-500'
      },
      size: {
        default: 'h-9 px-4 text-sm',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-md px-6 text-sm',
        icon: 'h-9 w-9',
        /** @deprecated alias of default; kept for existing callers. */
        md: 'h-9 px-4 text-sm'
      }
    },
    defaultVariants: { variant: 'default', size: 'default' }
  }
)

export type ButtonVariant = 'default' | 'secondary' | 'destructive' | 'outline' | 'ghost' | 'link' | 'success'
export type ButtonSize = 'sm' | 'md' | 'default' | 'lg' | 'icon'

/** Pure class map (unit-tested). `md` stays as an alias of shadcn `default`. */
export function buttonClass(variant: ButtonVariant = 'default', size: ButtonSize = 'md'): string {
  return buttonVariants({ variant, size: size === 'md' ? 'default' : size })
}

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  variant?: ButtonVariant
  size?: ButtonSize
}

export function Button({ variant = 'default', size = 'md', className, type, ...rest }: ButtonProps): React.JSX.Element {
  return (
    <button
      type={type ?? 'button'}
      className={cn(buttonVariants({ variant, size: size === 'md' ? 'default' : size }), className)}
      {...rest}
    />
  )
}
