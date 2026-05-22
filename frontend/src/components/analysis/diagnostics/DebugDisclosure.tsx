import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '../../../lib/utils'

export function DebugDisclosure({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="overflow-hidden rounded-2xl border border-aura-border/8 bg-aura-surface/72">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between px-5 py-4 text-left text-sm font-semibold text-aura-text transition-colors hover:bg-aura-bg/12"
      >
        <span>{title}</span>
        <ChevronDown
          size={16}
          className={cn('transition-transform duration-200', open ? 'rotate-180' : 'rotate-0')}
        />
      </button>
      <div
        className={cn(
          'grid transition-[grid-template-rows] duration-300 ease-out',
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
        )}
      >
        <div className="overflow-hidden">
          <div className="border-t border-aura-border/8 px-5 py-5">{children}</div>
        </div>
      </div>
    </div>
  )
}
