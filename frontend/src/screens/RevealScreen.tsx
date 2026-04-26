import { revealResult } from '../data'
import { CollapsibleDiagnosticsPanel } from '../components/CollapsibleDiagnosticsPanel'
import { DataRow } from '../components/DataRow'
import { PrimaryActionButton } from '../components/ActionButtons'
import { RevealPanel } from '../components/RevealPanel'
import { SecureKeyField } from '../components/SecureKeyField'
import { SurfacePanel } from '../components/SurfacePanel'
import { WaveformStrip } from '../components/WaveformStrip'

type Props = {
  revealKey: string
  onRevealKeyChange: (value: string) => void
}

export function RevealScreen({ revealKey, onRevealKeyChange }: Props) {
  return (
    <div className="grid gap-6">
      <SurfacePanel className="p-7">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <div className="text-[11px] uppercase tracking-[0.24em] text-aura-dim">
              Selected audio file
            </div>
            <div className="mt-2 text-2xl font-medium text-aura-text">{revealResult.fileName}</div>
            <div className="mt-2 text-sm text-aura-muted">
              Received from {revealResult.sender} · hidden payload intact
            </div>
          </div>
          <div className="w-full max-w-sm">
            <SecureKeyField
              value={revealKey}
              onChange={onRevealKeyChange}
              placeholder="Enter recovery key"
            />
          </div>
        </div>

        <div className="mt-6">
          <WaveformStrip tone="reveal" />
        </div>

        <div className="mt-6">
          <PrimaryActionButton disabled={!revealKey.trim()}>Extract &amp; Decrypt</PrimaryActionButton>
        </div>
      </SurfacePanel>

      <RevealPanel
        message={revealResult.message}
        confidence={revealResult.confidence}
        integrity={revealResult.integrity}
        sender={revealResult.sender}
        receivedAt={revealResult.receivedAt}
        payloadLength={revealResult.payloadLength}
      />

      <CollapsibleDiagnosticsPanel title="Recovery Diagnostics">
        <div className="space-y-1">
          <DataRow label="Bit confidence" value={revealResult.bitConfidence} />
          <DataRow label="Signal match" value={revealResult.signalMatch} />
          <DataRow label="Extraction status" value={revealResult.extraction} />
          <DataRow label="Error correction" value={revealResult.redundancy} />
        </div>
      </CollapsibleDiagnosticsPanel>
    </div>
  )
}
