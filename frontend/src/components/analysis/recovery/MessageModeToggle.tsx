import { cn } from '../../../lib/utils'
type MessageMode = 'recovered' | 'raw'
export function MessageModeToggle({
  value,
  onChange,
  disabledRaw,
}: {
  value: MessageMode
  onChange: (mode: MessageMode) => void
  disabledRaw: boolean
}) {
  return (
    <div className="inline-flex h-9 rounded-[10px] border border-aura-border/10 p-0.5">
      {(['recovered', 'raw'] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          disabled={mode === 'raw' && disabledRaw}
          onClick={() => onChange(mode)}
          className={cn(
            'rounded-[8px] px-3 text-[12px] font-medium capitalize transition-colors disabled:cursor-not-allowed disabled:opacity-35',
            value === mode
              ? 'bg-aura-text text-aura-bg'
              : 'text-aura-muted hover:bg-aura-surfaceSoft hover:text-aura-text',
          )}
        >
          {mode}
        </button>
      ))}
    </div>
  )
}
