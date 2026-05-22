import { cn } from '../../../lib/utils'

export function UnavailablePanel({
  message,
  compact = false,
}: {
  message: string
  compact?: boolean
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-2xl border border-dashed border-aura-border/12 bg-aura-bg/22 px-4 text-center text-sm text-aura-dim',
        compact ? 'min-h-[88px] py-4' : 'min-h-[220px] py-10',
      )}
    >
      {message}
    </div>
  )
}
