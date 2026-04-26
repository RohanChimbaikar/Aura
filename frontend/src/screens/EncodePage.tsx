import { useEffect, useRef, useState } from 'react'
import {
  Clock3,
  Download,
  FileAudio2,
  Hash,
  Layers2,
  Send,
  Sparkles,
} from 'lucide-react'
import { encodeAudio, previewEncode, resolveUrl } from '../services/api'
import type { ChatMessage, EncodePreview, EncodeResult, SelectedAudio, User } from '../types'

const PRESETS = [
  'the files were altered before review',
  'someone is hiding the audit records',
  'meet at the old bridge after sunset',
]

type Props = {
  onSendToChat: (message: Omit<ChatMessage, 'id'>, selected: SelectedAudio) => void
  onSelectAudio: (audio: SelectedAudio) => void
  currentUser?: User
  selectedRecipient?: string
}

function StatCard({
  label,
  value,
  icon: Icon,
  mono = false,
}: {
  label: string
  value: React.ReactNode
  icon: React.ElementType
  mono?: boolean
}) {
  return (
    <div className="rounded-xl border border-aura-border/10 bg-aura-surface px-3 py-3 shadow-sm">
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-aura-dim">
        <Icon size={11} strokeWidth={2.2} />
        <span>{label}</span>
      </div>
      <div
        className={`text-[18px] font-semibold leading-none tracking-tight text-aura-text ${
          mono ? 'font-mono text-[14px] leading-tight' : ''
        }`}
      >
        {value}
      </div>
    </div>
  )
}

export function EncodePage({
  onSendToChat,
  onSelectAudio,
  currentUser,
  selectedRecipient,
}: Props) {
  const [text, setText] = useState(PRESETS[0])
  const [preview, setPreview] = useState<EncodePreview | null>(null)
  const [result, setResult] = useState<EncodeResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
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

  const canSendToChat = Boolean(selectedRecipient)

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
                    Estimated carrier:{' '}
                    <span className="font-medium text-aura-text">{preview.carrier_alias}</span>
                    {' · '}
                    <span className="font-medium text-aura-text">
                      {preview.required_seconds}s
                    </span>
                  </>
                ) : (
                  'Checking available carrier…'
                )}
              </div>

              <button
                type="button"
                onClick={handleEncode}
                disabled={busy || !text.trim()}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-aura-accent px-4 py-2.5 text-[13px] font-semibold text-white shadow-sm transition hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
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
                  <h3 className="mt-1.5 truncate text-[16px] font-semibold text-aura-text">
                    {result.file_name}
                  </h3>
                  <p className="mt-1 text-[12px] text-aura-dim">
                    Ready to download or send into chat.
                  </p>
                </div>
              </div>

              <div className="px-4 py-3">
                <audio controls src={resolveUrl(result.audio_url)} className="w-full" />
              </div>

              <div className="flex flex-wrap gap-2 border-t border-aura-reveal/15 bg-aura-bg/20 px-4 py-3">
                <a
                  href={resolveUrl(result.audio_url)}
                  className="inline-flex items-center gap-2 rounded-xl border border-aura-border/10 bg-aura-surface px-3 py-2 text-[12px] font-medium text-aura-text transition hover:bg-aura-bg/70"
                >
                  <Download size={13} />
                  Download WAV
                </a>

                <button
                  type="button"
                  disabled={!canSendToChat}
                  onClick={() =>
                    onSendToChat(
                      {
                        type: 'audio',
                        direction: 'outgoing',
                        createdAt: new Date().toISOString(),
                        audioUrl: result.audio_url,
                        messageId: result.message_id,
                        metadata: result,
                      },
                      {
                        messageId: result.message_id,
                        audioUrl: result.audio_url,
                        fileName: result.file_name,
                        source: 'Chat',
                        metadata: result,
                      },
                    )
                  }
                  className="inline-flex items-center gap-2 rounded-xl border border-aura-reveal/25 bg-aura-reveal/12 px-3 py-2 text-[12px] font-semibold text-aura-reveal transition disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Send size={13} />
                  {canSendToChat ? 'Send to chat' : 'Select recipient first'}
                </button>
              </div>
            </section>
          )}
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-4">
          {/* Capacity */}
          <section className="rounded-2xl border border-aura-border/10 bg-aura-surface p-4 shadow-sm">
            <div className="mb-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-aura-dim">
                Payload capacity
              </div>
              <div className="mt-1 text-[12px] text-aura-dim">
                Live preview for the current message.
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <StatCard
                label="Header bytes"
                value={preview?.header_bytes ?? 2}
                icon={Layers2}
              />
              <StatCard
                label="Required chunks"
                value={preview?.required_chunks ?? '—'}
                icon={Hash}
              />
              <StatCard
                label="Required seconds"
                value={preview?.required_seconds ?? '—'}
                icon={Clock3}
              />
              <StatCard
                label="Required minutes"
                value={preview?.required_minutes ?? '—'}
                icon={Clock3}
              />
            </div>
          </section>

          {/* Carrier */}
          <section className="rounded-2xl border border-aura-border/10 bg-aura-surface p-4 shadow-sm">
            <div className="mb-3">
              <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-aura-dim">
                Carrier
              </div>
              <div className="mt-1 text-[12px] text-aura-dim">
                Aura chooses the smallest carrier that fits this message.
              </div>
            </div>

            <div className="grid gap-2.5">
              <div className="rounded-xl border border-aura-border/10 bg-aura-bg/35 px-3 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-aura-dim">
                  Name
                </div>
                <div className="mt-1 font-mono text-[14px] font-semibold text-aura-text">
                  {preview?.carrier_alias ?? '—'}
                </div>
              </div>

              <div className="rounded-xl border border-aura-border/10 bg-aura-bg/35 px-3 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-aura-dim">
                  Duration
                </div>
                <div className="mt-1 text-[16px] font-semibold text-aura-text">
                  {preview?.carrier_duration_sec
                    ? `${preview.carrier_duration_sec} sec`
                    : '—'}
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

export default EncodePage