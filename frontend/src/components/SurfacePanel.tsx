import type { PropsWithChildren } from 'react'
import { cn } from '../lib/utils'

type Props = PropsWithChildren<{
  className?: string
}>

export function SurfacePanel({ children, className }: Props) {
  return (
    <section
      className={cn(
        'aura-steel relative overflow-hidden rounded-[26px] border border-aura-border/24 bg-[linear-gradient(180deg,rgba(var(--aura-surface),0.96),rgba(var(--aura-surface),0.86))] p-6 shadow-[0_8px_32px_rgba(0,0,0,0.18)]',
        'before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_top,rgba(93,87,255,0.05),transparent_38%)] before:opacity-70',
        'after:pointer-events-none after:absolute after:inset-x-0 after:top-0 after:h-px after:bg-white/[0.05]',
        className,
      )}
    >
      <div className="relative">{children}</div>
    </section>
  )
}