import { cn } from '../../../lib/utils'

export function PartSelectorButton({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
        active
          ? 'bg-aura-reveal/12 text-aura-reveal'
          : 'text-aura-muted hover:bg-aura-bg/30 hover:text-aura-text',
      )}
    >
      {label}
    </button>
  )
}
