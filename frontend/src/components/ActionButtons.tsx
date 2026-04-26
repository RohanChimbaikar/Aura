import type { ButtonHTMLAttributes, PropsWithChildren } from 'react'
import { cn } from '../lib/utils'

type Props = PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'primary' | 'secondary'
  }
>

function BaseAction({ children, className, variant = 'primary', ...props }: Props) {
  return (
    <button
      className={cn(
        'aura-steel inline-flex items-center justify-center rounded-[20px] px-5 py-3.5 text-sm font-medium transition-all duration-300 ease-aura disabled:cursor-not-allowed disabled:opacity-35',
        variant === 'primary'
          ? 'border border-aura-accent/30 bg-aura-accentSoft/15 text-aura-text hover:border-aura-accent/55 hover:bg-aura-accent/18'
          : 'border border-aura-border/18 bg-aura-surface/35 text-aura-text hover:bg-aura-surface/55',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  )
}

export function PrimaryActionButton(props: Props) {
  return <BaseAction variant="primary" {...props} />
}

export function SecondaryActionButton(props: Props) {
  return <BaseAction variant="secondary" {...props} />
}
