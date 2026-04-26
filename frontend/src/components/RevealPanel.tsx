import { StatusBadge } from './StatusBadge'
import { DataRow } from './DataRow'
import { SurfacePanel } from './SurfacePanel'

type Props = {
  message: string
  confidence: string
  integrity: string
  sender: string
  receivedAt: string
  payloadLength: string
}

export function RevealPanel({
  message,
  confidence,
  integrity,
  sender,
  receivedAt,
  payloadLength,
}: Props) {
  return (
    <SurfacePanel className="bg-[linear-gradient(180deg,rgba(114,209,199,0.06),rgba(255,255,255,0.018))] before:bg-[radial-gradient(circle_at_top,rgba(114,209,199,0.12),transparent_44%)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.24em] text-aura-dim">
            Recovered payload
          </div>
          <div className="mt-4 max-w-2xl text-[24px] leading-9 tracking-[-0.03em] text-aura-text">
            {message}
          </div>
        </div>
        <StatusBadge label={integrity} tone="reveal" />
      </div>

      <div className="mt-8 grid gap-1 md:grid-cols-2">
        <DataRow label="Confidence score" value={confidence} />
        <DataRow label="Payload length" value={payloadLength} />
        <DataRow label="Sender" value={sender} />
        <DataRow label="Received" value={receivedAt} />
      </div>
    </SurfacePanel>
  )
}
