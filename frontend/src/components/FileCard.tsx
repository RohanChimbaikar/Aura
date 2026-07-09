import { useState, useRef } from 'react'
import { BarChart3, Download, FileAudio, LoaderCircle, Paperclip, Wand2, Play, Pause, Info, Trash2, Send } from 'lucide-react'
import { Badge } from './AuraPrimitives'
import {
  decodeAudioTransfer,
  decodeByReference,
  resolveUrl,
} from '../services/api'
import type { AudioTransfer, DecodeResult, SelectedAudio } from '../types'

type Props = {
  transfer: AudioTransfer
  currentUsername: string
  showNew?: boolean
  onReveal?: (audio: SelectedAudio) => void
  onAnalyze?: (audio: SelectedAudio) => void
  onDownloadPackage?: (audio: SelectedAudio) => void
  onForward?: (audio: SelectedAudio) => void
  onShowDetails?: (audio: SelectedAudio) => void
  onDelete?: (messageId: string) => void
}

export function FileCard({
  transfer,
  currentUsername,
  showNew,
  onReveal,
  onAnalyze,
  onDownloadPackage,
  onForward,
  onShowDetails,
  onDelete,
}: Props) {
  const [decodeState, setDecodeState] = useState<
    'idle' | 'loading' | 'success' | 'error'
  >('idle')
  const [decodeResult, setDecodeResult] = useState<DecodeResult | null>(null)
  const [decodeError, setDecodeError] = useState('')
  const [isPlaying, setIsPlaying] = useState(false)
  
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const isOwn = transfer.sender === currentUsername
  const direction = isOwn
    ? `Sent to ${transfer.receiver}`
    : `Received from ${transfer.sender}`
  
  const rawAudioUrl = transfer.audioUrl || `/api/files/${transfer.id}/download`
  const audioUrl = resolveUrl(rawAudioUrl)

  const selectedAudio: SelectedAudio = {
    messageId: transfer.messageId || String(transfer.id),
    audioUrl: rawAudioUrl,
    fileName: transfer.originalFilename,
    source: 'Chat',
    metadata: transfer.metadata,
    analysisSourceType:
      transfer.metadata?.mode === 'multi' || (transfer.metadata?.segments?.length ?? 0) > 1
        ? 'grouped'
        : 'single',
    transmissionId: transfer.metadata?.transmission_id,
    totalSegments: transfer.metadata?.total_segments,
    segments: transfer.metadata?.segments,
    selectedPartFilename: transfer.originalFilename,
  }
  const transferDate = new Date(transfer.createdAt)
  const timeValid = Number.isFinite(transferDate.getTime())
  const timeLabel = timeValid ? transferDate.toLocaleTimeString() : ''
  const dateTimeLabel = timeValid ? transferDate.toLocaleString() : ''

  async function handleDecode() {
    if (onReveal) {
      onReveal(selectedAudio)
      return
    }

    setDecodeState('loading')
    setDecodeError('')
    setDecodeResult(null)
    try {
      const result = transfer.source === 'aura' && transfer.messageId
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

  const handlePlayPreview = () => {
    if (!audioRef.current) return
    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
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
            {showNew ? <Badge tone="safe">New</Badge> : null}
          </div>

          <div className="mt-1 text-[13px] text-aura-muted">{direction}</div>
          <div className="mt-0.5 font-mono text-[10px] text-aura-dim">
            {dateTimeLabel || timeLabel || transfer.createdAt} ·{' '}
            {(transfer.fileSize / 1024 / 1024).toFixed(2)} MB
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-xl bg-aura-bg/44 p-2 ring-1 ring-aura-border/7">
        <audio
          ref={audioRef}
          controls
          preload="none"
          src={audioUrl}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
          className="w-full"
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={handlePlayPreview}
          className="h-9 inline-flex items-center justify-center gap-1.5 rounded-xl border border-aura-border/12 bg-white/[0.02] hover:bg-white/[0.06] text-aura-text px-3 text-[12px] font-semibold transition active:scale-[0.98]"
        >
          {isPlaying ? <Pause size={13} /> : <Play size={13} />}
          <span>{isPlaying ? 'Pause' : 'Preview'}</span>
        </button>

        <button
          type="button"
          onClick={() => onDownloadPackage?.(selectedAudio)}
          className="h-9 inline-flex items-center justify-center gap-1.5 rounded-xl border border-aura-border/12 bg-white/[0.02] hover:bg-white/[0.06] text-aura-text px-3 text-[12px] font-semibold transition active:scale-[0.98]"
        >
          <Download size={13} />
          <span>Download</span>
        </button>

        <button
          type="button"
          onClick={handleDecode}
          disabled={decodeState === 'loading'}
          className="h-9 inline-flex items-center justify-center gap-1.5 rounded-xl border border-aura-reveal/20 bg-aura-reveal/10 px-3 text-[12px] font-semibold text-aura-reveal transition-colors hover:bg-aura-reveal/14 active:scale-[0.98] disabled:cursor-not-allowed"
        >
          {decodeState === 'loading' ? (
            <LoaderCircle size={13} className="animate-spin" />
          ) : (
            <Wand2 size={13} />
          )}
          <span>{decodeState === 'loading' ? 'Decoding...' : 'Reveal'}</span>
        </button>

        {onAnalyze && (
          <button
            type="button"
            onClick={() => onAnalyze(selectedAudio)}
            className="h-9 inline-flex items-center justify-center gap-1.5 bg-aura-accent text-white px-3.5 text-[12px] font-semibold shadow-sm hover:opacity-90 active:scale-[0.98] transition"
          >
            <BarChart3 size={13} />
            <span>Analyse</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => onForward?.(selectedAudio)}
          className="h-9 inline-flex items-center justify-center gap-1.5 rounded-xl border border-aura-border/12 bg-white/[0.02] hover:bg-white/[0.06] text-aura-text px-3 text-[12px] font-semibold transition active:scale-[0.98]"
        >
          <Send size={13} className="rotate-[320deg]" />
          <span>Forward</span>
        </button>

        <button
          type="button"
          onClick={() => onShowDetails?.(selectedAudio)}
          className="h-9 inline-flex items-center justify-center gap-1.5 rounded-xl border border-aura-border/12 bg-white/[0.02] hover:bg-white/[0.06] text-aura-text px-3 text-[12px] font-semibold transition active:scale-[0.98]"
        >
          <Info size={13} />
          <span>Details</span>
        </button>

        {isOwn && onDelete && (
          <button
            type="button"
            onClick={() => onDelete(String(transfer.id))}
            className="h-9 inline-flex items-center justify-center gap-1.5 rounded-xl border border-red-500/20 bg-red-500/5 hover:bg-red-500/10 text-red-400 px-3 text-[12px] font-semibold transition active:scale-[0.98]"
          >
            <Trash2 size={13} />
            <span>Delete</span>
          </button>
        )}
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
