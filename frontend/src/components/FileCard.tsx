import { useState } from 'react'
import { BarChart3, Download, FileAudio, LoaderCircle, Paperclip, Wand2 } from 'lucide-react'
import {
  decodeAudioTransfer,
  decodeByReference,
  getAudioUrl,
  getDownloadUrl,
  resolveUrl,
} from '../services/api'
import type { AudioTransfer, DecodeResult, SelectedAudio } from '../types'

type Props = {
  transfer: AudioTransfer
  currentUsername: string
  onReveal?: (audio: SelectedAudio) => void
  onAnalyze?: (audio: SelectedAudio) => void
}

export function FileCard({ transfer, currentUsername, onReveal, onAnalyze }: Props) {
  const [decodeState, setDecodeState] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle')
  const [decodeResult, setDecodeResult] = useState<DecodeResult | null>(null)
  const [decodeError, setDecodeError] = useState('')

  const isOwn = transfer.sender === currentUsername
  const direction = isOwn
    ? `Sent to ${transfer.receiver}`
    : `Received from ${transfer.sender}`
  const isAuraGenerated = transfer.source === 'aura'
  const audioUrl = isAuraGenerated
    ? resolveUrl(transfer.audioUrl)
    : getAudioUrl(transfer.id)
  const downloadUrl = isAuraGenerated
    ? resolveUrl(transfer.audioUrl)
    : getDownloadUrl(transfer.id)
  const selectedAudio: SelectedAudio = {
    messageId: transfer.messageId || String(transfer.id),
    audioUrl: isAuraGenerated ? transfer.audioUrl || '' : getAudioUrl(transfer.id),
    fileName: transfer.originalFilename,
    source: 'Chat',
    metadata: transfer.metadata,
  }
  const transferDate = new Date(transfer.createdAt)
  const timeLabel = Number.isNaN(transferDate.getTime())
    ? ''
    : transferDate.toLocaleString()

  async function handleDecode() {
    if (onReveal) {
      onReveal(selectedAudio)
      return
    }

    setDecodeState('loading')
    setDecodeError('')
    setDecodeResult(null)
    try {
      const result = isAuraGenerated && transfer.messageId
        ? await decodeByReference(transfer.messageId, transfer.audioUrl)
        : await decodeAudioTransfer(transfer.id)
      setDecodeResult(result)
      setDecodeState('success')
    } catch (error) {
      setDecodeError(
        error instanceof Error ? error.message : 'Aura decode failed.',
      )
      setDecodeState('error')
    }
  }

  return (
    <div
      className={`rounded-2xl p-4 shadow-[0_18px_44px_rgba(0,0,0,0.16)] ring-1 ${
        isOwn
          ? 'bg-[linear-gradient(180deg,rgba(255,255,255,0.065),rgba(var(--aura-accent-soft),0.055))] ring-aura-accent/16'
          : 'bg-[linear-gradient(180deg,rgba(var(--aura-surface),0.88),rgba(var(--aura-surface-soft),0.72))] ring-aura-border/9'
      }`}
    >
      <div className="flex items-start gap-3.5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-aura-accentSoft/12 text-aura-accent ring-1 ring-aura-accent/18">
          <FileAudio size={18} />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[15px] font-semibold text-aura-text">
              {transfer.originalFilename}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-aura-accent/12 bg-aura-accentSoft/7 px-2 py-0.5 text-[10px] font-medium text-aura-muted">
              <Paperclip size={11} />
              Stego WAV
            </span>
          </div>

          <div className="mt-1 text-[13px] text-aura-muted">{direction}</div>
          <div className="mt-0.5 font-mono text-[10px] text-aura-dim">
            {timeLabel || transfer.createdAt} -{' '}
            {(transfer.fileSize / 1024 / 1024).toFixed(2)} MB
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-xl bg-aura-bg/44 p-2 ring-1 ring-aura-border/7">
        <audio
          controls
          preload="none"
          src={audioUrl}
          className="w-full"
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <a
          href={downloadUrl}
          className="inline-flex items-center justify-center rounded-xl border border-aura-border/12 bg-aura-surface/30 px-3 py-2 text-sm font-medium text-aura-muted transition-colors hover:bg-aura-surface/55 hover:text-aura-text"
        >
          <Download size={15} className="mr-2" />
          Download
        </a>

        <button
          type="button"
          onClick={handleDecode}
          disabled={decodeState === 'loading'}
          className="inline-flex items-center justify-center rounded-xl border border-aura-accent/32 bg-aura-accentSoft/22 px-4 py-2 text-sm font-semibold text-aura-text shadow-[0_8px_20px_rgba(0,0,0,0.10)] transition-colors hover:bg-aura-accent/24 disabled:cursor-not-allowed disabled:opacity-55"
        >
          {decodeState === 'loading' ? (
            <LoaderCircle size={15} className="mr-2 animate-spin" />
          ) : (
            <Wand2 size={15} className="mr-2" />
          )}
          {decodeState === 'loading' ? 'Decoding...' : 'Reveal Hidden Message'}
        </button>

        {onAnalyze ? (
          <button
            type="button"
            onClick={() => onAnalyze(selectedAudio)}
            className="inline-flex items-center justify-center rounded-xl border border-aura-border/12 bg-aura-surface/30 px-3 py-2 text-sm font-medium text-aura-muted transition-colors hover:bg-aura-surface/55 hover:text-aura-text"
          >
            <BarChart3 size={15} className="mr-2" />
            Open in Analysis
          </button>
        ) : null}
      </div>

      {decodeState === 'success' && decodeResult ? (
        <div className="mt-3 rounded-xl border border-aura-reveal/18 bg-aura-reveal/9 p-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-aura-reveal">
            Recovered text
          </div>
          <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-sm leading-6 text-aura-text">
            {decodeResult.recoveredText || '(No text recovered)'}
          </pre>
        </div>
      ) : null}

      {decodeState === 'error' ? (
        <div className="mt-3 rounded-xl border border-aura-danger/22 bg-aura-danger/10 p-3 text-sm leading-6 text-aura-danger">
          {decodeError}
        </div>
      ) : null}
    </div>
  )
}
