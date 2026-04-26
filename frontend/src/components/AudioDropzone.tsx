import { Upload } from 'lucide-react'
import { cn } from '../lib/utils'

type Props = {
  label?: string
  fileName?: string
  meta?: string
  compact?: boolean
}

export function AudioDropzone({ label, fileName, meta, compact = false }: Props) {
  return (
    <button
      type="button"
      className={cn(
        'aura-steel group relative w-full rounded-[28px] border border-dashed border-aura-border/18 bg-aura-surface/30 text-left transition-all duration-300 ease-aura hover:border-aura-accent/40 hover:bg-aura-surface/45',
        compact ? 'p-5' : 'p-7',
      )}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(93,87,255,0.1),transparent_56%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <div className="relative flex items-center gap-4">
        <div className="aura-steel flex h-12 w-12 items-center justify-center rounded-2xl border border-aura-border/18 bg-aura-surface/50 text-aura-accent">
          <Upload size={18} />
        </div>
        <div>
          <div className="text-sm font-medium text-aura-text">
            {fileName ?? label ?? 'Drop a speech audio file'}
          </div>
          <div className="mt-1 text-sm text-aura-muted">
            {meta ?? 'WAV, AIFF, or FLAC · secure cover source only'}
          </div>
        </div>
      </div>
    </button>
  )
}
