import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '../lib/utils'

type Props = {
  title: string
  children: React.ReactNode
}

export function CollapsibleDiagnosticsPanel({ title, children }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <div className="aura-steel rounded-[24px] border border-aura-border/18 bg-aura-surface/30">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <span className="text-sm font-medium text-aura-text">{title}</span>
        <ChevronDown
          size={16}
          className={cn('text-aura-dim transition-transform duration-300 ease-aura', open && 'rotate-180')}
        />
      </button>
      <div
        className={cn(
          'grid transition-all duration-300 ease-aura',
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-70',
        )}
      >
        <div className="overflow-hidden">
          <div className="border-t border-aura-border/18 px-5 py-4">{children}</div>
        </div>
      </div>
    </div>
  )
}
