import { Download, FlaskConical, Radio, Search, BarChart3 } from 'lucide-react'
import { Badge } from '../components/AuraPrimitives'
import { resolveUrl } from '../services/api'
import type { ChatMessage, SelectedAudio } from '../types'

type Props = {
  messages: ChatMessage[]
  onReveal: (audio: SelectedAudio) => void
  onAnalyze: (audio: SelectedAudio) => void
  onSimulateIncoming: () => void
}

export function ChatPage({ messages, onReveal, onAnalyze, onSimulateIncoming }: Props) {
  return (
    <section className="flex h-full min-w-0 flex-col bg-[linear-gradient(180deg,rgba(var(--aura-surface-soft),0.42),rgba(var(--aura-bg),0.96))]">
      <header className="flex h-[64px] shrink-0 items-center justify-between gap-4 border-b border-aura-border/8 bg-aura-surface/54 px-5 backdrop-blur-xl">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-[18px] font-semibold tracking-tight text-aura-text">Chat</h1>
            <Badge tone="safe">Live</Badge>
          </div>
          <p className="mt-0.5 text-[11px] text-aura-muted">
            Secure audio exchange. Aura WAV files can open directly in Reveal or Analysis.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden h-8 items-center gap-2 rounded-xl border border-aura-border/10 bg-aura-bg/35 px-3 lg:flex">
            <Search size={12} className="text-aura-dim" />
            <span className="text-[11px] text-aura-dim">Search</span>
          </div>

          <button
            type="button"
            onClick={onSimulateIncoming}
            className="rounded-xl border border-aura-border/10 bg-aura-bg/35 px-3 py-1.5 text-[12px] font-medium text-aura-text transition-colors hover:bg-aura-bg/50"
          >
            Simulate incoming
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div className="mx-auto max-w-[920px] space-y-3">
          {messages.length === 0 ? (
            <div className="pt-20 text-center text-[13px] text-aura-muted">
              Encode a message and send the generated stego WAV to chat.
            </div>
          ) : null}

          {messages.map((message) =>
            message.type === 'audio' ? (
              <AudioBubble
                key={message.id}
                message={message}
                onReveal={onReveal}
                onAnalyze={onAnalyze}
              />
            ) : (
              <TextBubble key={message.id} message={message} />
            ),
          )}
        </div>
      </div>
    </section>
  )
}

function TextBubble({ message }: { message: ChatMessage }) {
  const isOutgoing = message.direction === 'outgoing'

  return (
    <div className={`flex ${isOutgoing ? 'justify-end' : 'justify-start'}`}>
      <div
        className={[
          'max-w-[46%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-5 ring-1 shadow-sm',
          isOutgoing
            ? 'bg-aura-surface/84 text-aura-text ring-aura-reveal/16'
            : 'bg-aura-surface/76 text-aura-text ring-aura-border/8',
        ].join(' ')}
      >
        <div>{message.text}</div>
        <div className="mt-1 text-[10px] text-aura-muted">{message.createdAt}</div>
      </div>
    </div>
  )
}

function AudioBubble({
  message,
  onReveal,
  onAnalyze,
}: {
  message: ChatMessage
  onReveal: (audio: SelectedAudio) => void
  onAnalyze: (audio: SelectedAudio) => void
}) {
  const isOutgoing = message.direction === 'outgoing'
  const hasAudio = Boolean(message.audioUrl)

  const selected: SelectedAudio = {
    messageId: message.messageId || message.id,
    audioUrl: message.audioUrl || '',
    fileName: message.metadata?.file_name || `${message.messageId || message.id}.wav`,
    source: 'Chat',
    metadata: message.metadata,
  }

  return (
    <div className={`flex ${isOutgoing ? 'justify-end' : 'justify-start'}`}>
      <div className="w-full max-w-[560px] rounded-2xl bg-[linear-gradient(180deg,rgba(var(--aura-surface),0.88),rgba(var(--aura-surface-soft),0.68))] px-3.5 py-3 shadow-[0_10px_28px_rgba(0,0,0,0.10)] ring-1 ring-aura-border/8">
        <div className="mb-2.5 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-aura-reveal/10">
                <Radio size={14} className="text-aura-reveal" />
              </div>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate text-[14px] font-semibold text-aura-text">
                    {message.metadata?.file_name || message.messageId || 'Secure audio'}
                  </span>
                  <Badge tone="accent">Stego WAV</Badge>
                </div>

                <p className="mt-0.5 text-[11px] text-aura-dim">
                  {isOutgoing ? 'Sent' : 'Received'} • {message.createdAt}
                </p>
              </div>
            </div>
          </div>

          <Badge tone={isOutgoing ? 'accent' : 'safe'}>
            {isOutgoing ? 'Outgoing' : 'Incoming'}
          </Badge>
        </div>

        <div className="rounded-xl border border-aura-border/8 bg-aura-bg/28 p-2">
          <audio controls src={hasAudio ? resolveUrl(message.audioUrl) : undefined} className="h-9 w-full" />
        </div>

        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => onReveal(selected)}
            disabled={!hasAudio}
            className="inline-flex items-center rounded-xl border border-aura-reveal/20 bg-aura-reveal/10 px-3 py-1.5 text-[12px] font-semibold text-aura-reveal transition-colors hover:bg-aura-reveal/14 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FlaskConical size={13} className="mr-1.5" />
            Reveal
          </button>

          <button
            type="button"
            onClick={() => onAnalyze(selected)}
            disabled={!hasAudio}
            className="inline-flex items-center rounded-xl border border-aura-border/10 bg-aura-bg/35 px-3 py-1.5 text-[12px] font-medium text-aura-text transition-colors hover:bg-aura-bg/50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <BarChart3 size={13} className="mr-1.5" />
            Analysis
          </button>

          <a
            href={hasAudio ? resolveUrl(message.audioUrl) : undefined}
            className="inline-flex items-center rounded-xl border border-aura-border/10 bg-aura-bg/35 px-3 py-1.5 text-[12px] font-medium text-aura-text transition-colors hover:bg-aura-bg/50"
          >
            <Download size={13} className="mr-1.5" />
            Download
          </a>
        </div>
      </div>
    </div>
  )
}