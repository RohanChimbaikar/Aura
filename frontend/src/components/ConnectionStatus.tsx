import { Wifi, WifiOff } from 'lucide-react'
import { cn } from '../lib/utils'
import type { ConnectionState } from '../types'

type Props = {
  state: ConnectionState
}

const statusMap: Record<ConnectionState, { label: string; tone: string }> = {
  connecting: { label: 'Connecting', tone: 'text-amber-300 border-amber-300/18 bg-amber-300/8' },
  connected: { label: 'Live', tone: 'text-aura-reveal border-aura-reveal/18 bg-aura-reveal/10' },
  disconnected: { label: 'Offline', tone: 'text-aura-danger border-aura-danger/18 bg-aura-danger/10' },
}

export function ConnectionStatus({ state }: Props) {
  const icon =
    state === 'connected' ? (
      <Wifi size={14} />
    ) : (
      <WifiOff size={14} />
    )

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[12px] font-semibold',
        statusMap[state].tone,
      )}
    >
      {icon}
      <span>{statusMap[state].label}</span>
    </div>
  )
}
