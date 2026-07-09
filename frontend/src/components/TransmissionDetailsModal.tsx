import { X, Clipboard, ShieldCheck } from 'lucide-react'
import type { SelectedAudio } from '../types'
import { SurfacePanel } from './SurfacePanel'

type Props = {
  isOpen: boolean
  onClose: () => void
  audio: SelectedAudio | null
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void
}

export function TransmissionDetailsModal({
  isOpen,
  onClose,
  audio,
  showToast,
}: Props) {
  if (!isOpen || !audio) return null

  const metadata = (audio.metadata || {}) as any
  const sender = metadata.sender || 'Unknown'
  const recipient = metadata.recipient || 'Unknown'
  const timestamp = metadata.created_at || 'Unknown'
  const transmissionId = audio.transmissionId || metadata.transmission_id || 'N/A'
  
  const isMulti = audio.mode === 'multi' || metadata.mode === 'multi' || (audio.totalSegments ?? 0) > 1
  const mode = isMulti ? 'Multi-part' : 'Single-part'
  
  const carrier = metadata.carrier || audio.metadata?.carrier_alias || 'Unknown'
  const duration = metadata.duration || audio.metadata?.carrier_duration_sec 
    ? `${metadata.duration || audio.metadata?.carrier_duration_sec} seconds` 
    : 'Unknown'
  
  const checksum = metadata.checksum || metadata.hash || (audio.metadata as any)?.checksum || 'N/A'
  const version = metadata.version || '2'

  const copyChecksum = () => {
    if (checksum && checksum !== 'N/A') {
      void navigator.clipboard?.writeText(checksum)
      showToast?.('✓ Checksum copied to clipboard.', 'success')
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-md">
      {/* Backdrop click dismiss */}
      <div className="absolute inset-0 cursor-default" onClick={onClose} />

      <SurfacePanel className="relative w-full max-w-lg overflow-hidden p-6 shadow-2xl border border-white/12 rounded-[24px]">
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-aura-muted hover:text-aura-text transition-colors"
          aria-label="Close modal"
        >
          <X size={18} />
        </button>

        {/* Modal Content */}
        <div className="space-y-6">
          <div className="border-b border-white/8 pb-4">
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-aura-accent">
              Aura Signal Header
            </h2>
            <h3 className="mt-1 text-2xl font-semibold text-aura-text">
              Transmission Details
            </h3>
          </div>

          {/* Icon Badge */}
          <div className="flex flex-col items-center gap-2 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-aura-reveal/10 border border-aura-reveal/20 text-aura-reveal">
              <ShieldCheck size={28} />
            </div>
            <div className="mt-1">
              <h4 className="text-md font-semibold text-aura-text">
                {audio.fileName || 'secure_audio.wav'}
              </h4>
              <p className="text-xs text-aura-muted mt-0.5">
                ID: {audio.messageId || 'N/A'}
              </p>
            </div>
          </div>

          {/* Details Table */}
          <div className="space-y-3.5 rounded-2xl bg-white/[0.02] border border-white/4 p-4 text-[13px] leading-relaxed">
            <div className="flex justify-between items-center py-0.5 border-b border-white/[0.03] pb-2">
              <span className="text-aura-muted">Sender Node</span>
              <span className="font-semibold text-aura-text font-mono">@{sender}</span>
            </div>

            <div className="flex justify-between items-center py-0.5 border-b border-white/[0.03] pb-2">
              <span className="text-aura-muted">Recipient Node</span>
              <span className="font-semibold text-aura-text font-mono">@{recipient}</span>
            </div>

            <div className="flex justify-between items-center py-0.5 border-b border-white/[0.03] pb-2">
              <span className="text-aura-muted">Timestamp</span>
              <span className="text-aura-text font-medium">{timestamp}</span>
            </div>

            <div className="flex justify-between items-center py-0.5 border-b border-white/[0.03] pb-2">
              <span className="text-aura-muted">Transmission ID</span>
              <span className="text-aura-text font-mono font-medium">{transmissionId}</span>
            </div>

            <div className="flex justify-between items-center py-0.5 border-b border-white/[0.03] pb-2">
              <span className="text-aura-muted">Carrier File</span>
              <span className="text-aura-text font-medium truncate max-w-[200px]" title={carrier}>{carrier}</span>
            </div>

            <div className="flex justify-between items-center py-0.5 border-b border-white/[0.03] pb-2">
              <span className="text-aura-muted">Mode</span>
              <span className="text-aura-text font-medium">{mode}</span>
            </div>

            {isMulti && (
              <div className="flex justify-between items-center py-0.5 border-b border-white/[0.03] pb-2">
                <span className="text-aura-muted">Total segments</span>
                <span className="text-aura-text font-medium">
                  {audio.totalSegments || metadata.parts || (audio.segments?.length ?? 1)} parts
                </span>
              </div>
            )}

            <div className="flex justify-between items-center py-0.5 border-b border-white/[0.03] pb-2">
              <span className="text-aura-muted">Carrier Duration</span>
              <span className="text-aura-text font-medium">{duration}</span>
            </div>

            <div className="flex justify-between items-center py-0.5 border-b border-white/[0.03] pb-2">
              <span className="text-aura-muted">Checksum (SHA-256)</span>
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-aura-text font-mono truncate max-w-[150px]" title={checksum}>
                  {checksum}
                </span>
                {checksum !== 'N/A' && (
                  <button
                    type="button"
                    onClick={copyChecksum}
                    className="text-aura-dim hover:text-white transition-colors"
                    aria-label="Copy checksum"
                  >
                    <Clipboard size={13} />
                  </button>
                )}
              </div>
            </div>

            <div className="flex justify-between items-center py-0.5">
              <span className="text-aura-muted">Version</span>
              <span className="text-aura-text font-mono">{version}</span>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={onClose}
              className="h-10 inline-flex items-center justify-center rounded-xl bg-white/[0.06] text-white px-5 text-[13px] font-semibold hover:bg-white/10 active:scale-[0.98] transition-all"
            >
              Close
            </button>
          </div>
        </div>
      </SurfacePanel>
    </div>
  )
}
