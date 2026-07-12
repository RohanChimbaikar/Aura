import { useEffect, useRef, useState } from 'react'
import {
  Download,
  Send,
  Sparkles,
  Play,
  Pause,
} from 'lucide-react'
import { encodeAudio, previewEncode, resolveUrl } from '../services/api'
import type { ChatMessage, EncodePreview, EncodeResult, SelectedAudio, User } from '../types'
import { RecipientModal } from '../components/RecipientModal'

const PRESETS = [
  'the files were altered before review',
  'someone is hiding the audit records',
  'Code Black. Abort mission.',
]

type Props = {
  onSendToChat: (message: Omit<ChatMessage, 'id'>, selected: SelectedAudio, recipientOverride?: string) => void
  onSelectAudio: (audio: SelectedAudio) => void
  currentUser?: User
  selectedRecipient?: string
  users: User[]
  onlineUsers: Set<string>
  recentUsers: string[]
}

export function EncodePage({
  onSendToChat,
  onSelectAudio,
  selectedRecipient,
  users,
  onlineUsers,
  recentUsers,
  currentUser,
}: Props) {
  const [text, setText] = useState(PRESETS[0])
  const [preview, setPreview] = useState<EncodePreview | null>(null)
  const [result, setResult] = useState<EncodeResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showRecipientModal, setShowRecipientModal] = useState(false)
  
  // Audio playback preview state
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      try {
        setError('')
        const nextPreview = await previewEncode(text)
        setPreview(nextPreview)
      } catch (err) {
        setPreview(null)
        setError(err instanceof Error ? err.message : 'Preview failed.')
      }
    }, 250)

    return () => window.clearTimeout(timer)
  }, [text])

  async function handleEncode() {
    if (!text.trim()) return

    setBusy(true)
    setError('')

    try {
      const next = await encodeAudio(text)
      setResult(next)
      setIsPlaying(false) // Reset preview player state

      onSelectAudio({
        messageId: next.message_id,
        audioUrl: next.audio_url,
        fileName: next.file_name,
        source: 'Encode',
        metadata: next,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Encode failed.')
    } finally {
      setBusy(false)
    }
  }

  // Toggle audio preview play/pause
  const handlePlayPreview = () => {
    if (!audioRef.current) return
    if (isPlaying) {
      audioRef.current.pause()
    } else {
      audioRef.current.play()
    }
  }

  // Handle Send to Chat action (always opens selection/confirmation dialog)
  const handleSendToChatClick = () => {
    setShowRecipientModal(true)
  }

  const triggerSendToChat = (recipientUsername: string) => {
    if (!result) return
    onSendToChat(
      {
        type: result.mode === 'multi' ? 'audio_group' : 'audio',
        direction: 'outgoing',
        createdAt: new Date().toISOString(),
        audioUrl: result.audio_url,
        messageId: result.message_id,
        transmissionId: result.transmission_id,
        mode: result.mode,
        totalSegments: result.total_segments,
        segments:
          result.mode === 'multi'
            ? (result.segments || []).map((segment) => ({
                segmentIndex: segment.segment_index,
                totalSegments: result.total_segments,
                audioUrl: segment.audio_url,
                fileName: segment.stego_file_name,
                carrierName: segment.carrier_name,
                carrierDurationSec: segment.carrier_duration_sec,
              }))
            : undefined,
        manifest: result.manifest,
        metadata: result,
      },
      {
        messageId: result.message_id,
        audioUrl: result.audio_url,
        fileName: result.file_name,
        source: 'Chat',
        mode: result.mode,
        transmissionId: result.transmission_id,
        totalSegments: result.total_segments,
        segments:
          result.mode === 'multi'
            ? (result.segments || []).map((segment) => ({
                segmentIndex: segment.segment_index,
                totalSegments: result.total_segments,
                audioUrl: segment.audio_url,
                fileName: segment.stego_file_name,
                carrierName: segment.carrier_name,
                carrierDurationSec: segment.carrier_duration_sec,
              }))
            : undefined,
        metadata: result,
      },
      recipientUsername
    )
  }

  const handleConfirmRecipient = (recipientUsername: string) => {
    setShowRecipientModal(false)
    triggerSendToChat(recipientUsername)
  }

  const planMode = preview?.plan?.mode
  const isMultiPlanned = planMode === 'multi'
  const isExceeded = planMode === 'exceeded'


  return (
    <div className="flex flex-col gap-4">
      {/* Compact header */}
      <section className="rounded-2xl border border-aura-border/10 bg-aura-surface px-5 py-4 shadow-sm">
        <div className="flex flex-col gap-2">
          <div className="min-w-0">
            <h1 className="text-[24px] font-semibold tracking-tight text-aura-text">Encode</h1>
            <p className="mt-1 text-[13px] leading-relaxed text-aura-dim">
              Hide text inside an approved speech carrier.
            </p>
          </div>
        </div>
      </section>

      {/* Main layout */}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_360px]">
        {/* Left column */}
        <div className="flex flex-col gap-4">
          {error && (
            <div className="rounded-xl border border-red-300/40 bg-red-500/10 px-4 py-3 text-[12px] text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Composer */}
          <section className="overflow-hidden rounded-2xl border border-aura-border/10 bg-aura-surface shadow-sm">
            <div className="flex items-center justify-between border-b border-aura-border/8 px-4 py-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-aura-dim">
                  Secret message
                </div>
                <div className="mt-1 text-[13px] text-aura-dim">
                  Write the hidden text you want Aura to embed.
                </div>
              </div>
              <div className="rounded-full border border-aura-border/10 bg-aura-bg/60 px-2.5 py-1 font-mono text-[11px] text-aura-dim">
                {text.length} chars
              </div>
            </div>

            <div className="px-4 pt-4">
              <textarea
                ref={textareaRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Type your hidden message..."
                rows={6}
                className="min-h-[160px] w-full resize-none rounded-xl border border-aura-border/10 bg-aura-bg/35 px-4 py-3 text-[15px] leading-6 text-aura-text outline-none placeholder:text-aura-dim/50 focus:border-aura-accent/30"
              />
            </div>

            <div className="px-4 py-3">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-aura-dim">
                Quick fill
              </div>
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((preset) => {
                  const active = text === preset
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setText(preset)}
                      className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                        active
                          ? 'border-aura-accent/25 bg-aura-accentSoft/20 text-aura-accent'
                          : 'border-aura-border/10 bg-aura-bg/50 text-aura-dim hover:border-aura-border/20 hover:text-aura-text'
                      }`}
                    >
                      {preset}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex flex-col gap-2 border-t border-aura-border/8 bg-aura-bg/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-[11px] text-aura-dim">
                {preview ? (
                  <>
                    {isMultiPlanned ? (
                      <span>
                        This message will be transmitted as{' '}
                        <span className="font-medium text-aura-text">
                          {preview.plan?.totalSegments} ordered audio parts
                        </span>
                        {' · '}
                        <span className="font-medium text-aura-text">reuse enabled</span>
                        {' · '}
                        <span className="font-medium text-aura-text">
                          {preview.plan?.totalDurationMin} min total
                        </span>
                      </span>
                    ) : isExceeded ? (
                      <span>This message exceeds Aura&apos;s current safe transmission limit.</span>
                    ) : (
                      <span>
                        Estimated carrier:{' '}
                        <span className="font-medium text-aura-text">{preview.carrier_alias}</span>
                        {' · '}
                        <span className="font-medium text-aura-text">
                          {preview.required_seconds}s
                        </span>
                      </span>
                    )}
                  </>
                ) : (
                  'Checking available carrier…'
                )}
              </div>

              <button
                type="button"
                onClick={handleEncode}
                disabled={busy || !text.trim() || isExceeded}
                className="h-10 inline-flex items-center justify-center gap-2 px-4 rounded-xl bg-aura-accent text-white font-semibold text-[13px] transition hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 shadow-sm shadow-aura-accent/15"
              >
                <Sparkles size={15} strokeWidth={2.2} />
                {busy ? 'Encoding…' : 'Generate Secure Audio'}
              </button>
            </div>
          </section>

          {/* Result */}
          {result && (
            <section className="overflow-hidden rounded-2xl border border-aura-reveal/20 bg-aura-reveal/5 shadow-sm">
              <div className="flex flex-col gap-2 border-b border-aura-reveal/15 px-4 py-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-aura-dim">
                    Encoded audio
                  </div>
                  <h3 className="mt-1.5 truncate text-[16px] font-semibold text-aura-text">{result.file_name}</h3>
                  <p className="mt-1 text-[12px] text-aura-dim">
                    {result.mode === 'multi'
                      ? `Grouped Aura transmission (${result.total_segments ?? 0} parts).`
                      : 'Ready to download or send into chat.'}
                  </p>
                </div>
              </div>

              <div className="px-4 py-3">
                <audio
                  ref={audioRef}
                  controls
                  src={resolveUrl(result.audio_url)}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onEnded={() => setIsPlaying(false)}
                  className="w-full"
                />
                
                {result.mode === 'multi' && (result.segments?.length ?? 0) > 1 ? (
                  <div className="mt-3 grid gap-2">
                    {(result.segments || [])
                      .slice()
                      .sort((a, b) => (a.segment_index ?? a.segmentIndex ?? 0) - (b.segment_index ?? b.segmentIndex ?? 0))
                      .map((segment, idx, arr) => (
                        <div key={segment.stego_file_name} className="rounded-lg border border-aura-border/10 bg-aura-bg/30 px-3 py-2 text-[12px] text-aura-muted">
                          <div className="font-medium text-aura-text">Part {idx + 1} of {arr.length}</div>
                          <a href={resolveUrl(segment.audio_url)} className="text-aura-reveal hover:underline">
                            {segment.stego_file_name}
                          </a>
                        </div>
                      ))}
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2.5 border-t border-aura-reveal/15 bg-aura-bg/20 px-4 py-3">
                <button
                  type="button"
                  onClick={handlePlayPreview}
                  className="h-10 inline-flex items-center justify-center gap-2 px-4 rounded-xl border border-aura-border/12 bg-white/[0.02] hover:bg-white/[0.06] text-aura-text transition font-semibold text-[13px] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isPlaying ? <Pause size={14} /> : <Play size={14} />}
                  <span>{isPlaying ? 'Pause' : 'Preview'}</span>
                </button>

                <a
                  href={resolveUrl(result.audio_url)}
                  download={result.file_name}
                  className="h-10 inline-flex items-center justify-center gap-2 px-4 rounded-xl border border-aura-border/12 bg-white/[0.02] hover:bg-white/[0.06] text-aura-text transition font-semibold text-[13px] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Download size={14} />
                  <span>Download</span>
                </a>

                <button
                  type="button"
                  onClick={handleSendToChatClick}
                  className="h-10 inline-flex items-center justify-center gap-2 px-5 rounded-xl bg-aura-accent text-white font-semibold text-[13px] transition hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 shadow-sm shadow-aura-accent/15 flex-1 md:flex-none"
                >
                  <Send size={14} />
                  <span>Send to Chat</span>
                </button>
              </div>
            </section>
          )}
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-4">
          {/* Transmission Details Card */}
          <section className="rounded-2xl border border-aura-border/10 bg-aura-surface p-5 shadow-sm">
            <div className="mb-4">
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.14em] text-aura-dim">
                Transmission Details
              </h2>
            </div>

            <div className="space-y-4">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-aura-dim">Carrier</div>
                <div className="mt-1 font-mono text-[14px] font-semibold text-aura-text truncate" title={isMultiPlanned ? 'Multi-part Pool' : (preview?.carrier_alias ?? '—')}>
                  {isMultiPlanned ? 'Multi-part Pool' : (preview?.carrier_alias ?? '—')}
                </div>
              </div>

              <div className="h-px bg-white/[0.04]" />

              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-aura-dim">Mode</div>
                <div className="mt-1 text-[14px] font-semibold text-aura-text">
                  {isMultiPlanned ? 'Multi-part' : (planMode === 'exceeded' ? 'Exceeded' : 'Single-part')}
                </div>
              </div>

              <div className="h-px bg-white/[0.04]" />

              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-aura-dim">Duration</div>
                <div className="mt-1 text-[14px] font-semibold text-aura-text">
                  {isMultiPlanned
                    ? `${preview?.plan?.totalDurationMin ?? 0} min`
                    : (preview?.carrier_duration_sec 
                        ? `${Math.floor(preview.carrier_duration_sec / 60)} min` 
                        : '—')}
                </div>
              </div>

              <div className="h-px bg-white/[0.04]" />

              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-aura-dim">Capacity</div>
                <div className="mt-1 font-mono text-[14px] font-semibold text-aura-text">
                  {preview?.required_chunks ? `${preview.required_chunks} chunks` : '—'}
                </div>
              </div>

              <div className="h-px bg-white/[0.04]" />

              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-aura-dim">Protection</div>
                <div className="mt-1 text-[14px] font-semibold text-aura-text">
                  Length Header Repeat ×3
                </div>
              </div>

              <div className="h-px bg-white/[0.04]" />

              <div>
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-aura-dim">Required Duration</div>
                <div className="mt-1 text-[14px] font-semibold text-aura-text">
                  {isMultiPlanned
                    ? `${preview?.plan?.totalDurationSec ?? 0} seconds`
                    : (preview?.required_seconds ? `${preview.required_seconds} seconds` : '—')}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Recipient Selection Dialog Modal */}
      {currentUser && (
        <RecipientModal
          isOpen={showRecipientModal}
          onClose={() => setShowRecipientModal(false)}
          users={users}
          onlineUsers={onlineUsers}
          recentUsers={recentUsers}
          selectedRecipient={selectedRecipient}
          onConfirm={handleConfirmRecipient}
        />
      )}
    </div>
  )
}

export default EncodePage
