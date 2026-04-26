import { ChevronRight } from 'lucide-react'
import { cn } from '../lib/utils'
import type { AudioTransfer } from '../types'

type Props = {
  transfer: AudioTransfer
  selected?: boolean
}

export function InboxRow({ transfer, selected = false }: Props) {
  return (
    <button
      type="button"
      className={cn(
        'flex w-full items-center gap-5 rounded-[24px] px-4 py-4 text-left transition-all duration-300 ease-aura',
        selected ? 'bg-white/[0.05]' : 'hover:bg-white/[0.03]',
      )}
    >
      <div className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-sm text-aura-text">
        {transfer.sender.slice(0, 2).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-aura-text">{transfer.sender}</div>
        <div className="mt-1 text-sm text-aura-muted">
          {transfer.originalFilename} • Stego WAV received
        </div>
      </div>
      <div className="text-right">
        <div className="font-mono text-xs text-aura-text">
          {new Date(transfer.createdAt).toLocaleTimeString()}
        </div>
        <div className="mt-1 text-xs text-aura-dim">
          {(transfer.fileSize / 1024 / 1024).toFixed(2)} MB
        </div>
      </div>
      <ChevronRight size={16} className="text-aura-dim" />
    </button>
  )
}
