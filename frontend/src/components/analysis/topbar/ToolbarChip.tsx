import { cn } from '../../../lib/utils'
import type { ReactNode } from 'react'

type Props = {
  value: ReactNode
  className?: string
}
export function ToolbarChip({ value, className }: Props) {
  return (
    <div
      className={cn(
        'aura-toolbar-chip inline-flex h-8 items-center truncate rounded-xl px-2.5 font-mono text-[11px] text-aura-muted',
        className,
      )}
    >
      {value}
    </div>
  )
}