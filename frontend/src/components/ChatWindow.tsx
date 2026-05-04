import { useEffect, useRef } from 'react'
import { BarChart3, Download, FlaskConical, Radio } from 'lucide-react'
import { Badge } from './AuraPrimitives'
import { FileCard } from './FileCard'
import { MessageBubble } from './MessageBubble'
import { resolveUrl } from '../services/api'
import type { ChatMessage, ConversationItem, SelectedAudio } from '../types'

const RECENT_INCOMING_AUDIO_MS = 5 * 60 * 1000

function itemTimeMs(item: ConversationItem): number {
  if (item.type === 'message') {
    const t = new Date(String(item.message.createdAt)).getTime()
    return Number.isFinite(t) ? t : 0
  }
  if (item.type === 'aura_message') {
    const t = new Date(String(item.message.createdAt)).getTime()
    return Number.isFinite(t) ? t : 0
  }
  const t = new Date(String(item.transfer.createdAt)).getTime()
  return Number.isFinite(t) ? t : 0
}

/** Receiver-side: highlight very recent incoming audio (upload + encode-to-chat). */
function isIncomingAudioNew(item: ConversationItem, currentUsername: string): boolean {
  if (Date.now() - itemTimeMs(item) >= RECENT_INCOMING_AUDIO_MS) return false
  if (item.type === 'file') {
    return item.transfer.sender !== currentUsername
  }
  if (item.type === 'aura_message') {
    const m = item.message
    if (m.sender === currentUsername) return false
    return m.type === 'audio' || m.type === 'audio_group'
  }
  return false
}

type Props = {
  items: ConversationItem[]
  currentUsername: string
  selectedRecipient: string
  emptyState: string
  onRevealAudio?: (audio: SelectedAudio) => void
  onAnalyzeAudio?: (audio: SelectedAudio) => void
}

export function ChatWindow({
  items,
  currentUsername,
  selectedRecipient,
  emptyState,
  onRevealAudio,
  onAnalyzeAudio,
}: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const wasNearBottomRef = useRef(true)
  const prevLengthRef = useRef(0)
  const prevRecipientRef = useRef(selectedRecipient)
  const hasInitialScrollDoneRef = useRef(false)

  const scrollToBottom = (behavior: ScrollBehavior = 'auto') => {
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({
        behavior,
        block: 'end',
      })
    })
  }

  useEffect(() => {
    const container = scrollRef.current
    if (!container) return

    const handleScroll = () => {
      const distanceFromBottom =
        container.scrollHeight - container.scrollTop - container.clientHeight
      wasNearBottomRef.current = distanceFromBottom <= 120
    }

    handleScroll()
    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    if (items.length === 0) {
      prevLengthRef.current = 0
      hasInitialScrollDoneRef.current = false
      prevRecipientRef.current = selectedRecipient
      return
    }

    const recipientChanged = prevRecipientRef.current !== selectedRecipient
    const lengthIncreased = items.length > prevLengthRef.current
    const firstLoadWithItems = !hasInitialScrollDoneRef.current

    // 1) First load with messages -> jump instantly to latest
    if (firstLoadWithItems) {
      scrollToBottom('auto')
      hasInitialScrollDoneRef.current = true
    }
    // 2) Switching conversation -> jump instantly to latest
    else if (recipientChanged) {
      scrollToBottom('auto')
    }
    // 3) New messages while already in chat -> smooth scroll only if user is near bottom
    else if (lengthIncreased && wasNearBottomRef.current) {
      scrollToBottom('smooth')
    }

    prevRecipientRef.current = selectedRecipient
    prevLengthRef.current = items.length
  }, [items.length, selectedRecipient])

  return (
    <div
      ref={scrollRef}
      className="h-full min-h-0 overflow-y-auto bg-[radial-gradient(circle_at_18%_10%,rgba(var(--aura-reveal),0.035),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.018),transparent_26%)] px-5 py-5 lg:px-7"
    >
      {items.length === 0 ? (
        <div className="flex h-full items-center justify-center px-6 text-center text-sm leading-6 text-aura-muted">
          {emptyState}
        </div>
      ) : (
        <div className="mx-auto flex max-w-[1180px] flex-col space-y-3.5 pb-4">
          {items.map((item) =>
            item.type === 'message' ? (
              <MessageBubble
                key={item.id}
                message={item.message}
                isOwn={item.message.sender === currentUsername}
              />
            ) : item.type === 'aura_message' ? (
              <AuraMessageCard
                key={item.id}
                message={item.message}
                currentUsername={currentUsername}
                showNew={isIncomingAudioNew(item, currentUsername)}
                onReveal={onRevealAudio}
                onAnalyze={onAnalyzeAudio}
              />
            ) : (
              <div
                key={item.id}
                className={`flex ${
                  item.transfer.sender === currentUsername
                    ? 'justify-end'
                    : 'justify-start'
                }`}
              >
                <div className="w-full max-w-[560px]">
                  <FileCard
                    transfer={item.transfer}
                    currentUsername={currentUsername}
                    showNew={isIncomingAudioNew(item, currentUsername)}
                    onReveal={onRevealAudio}
                    onAnalyze={onAnalyzeAudio}
                  />
                </div>
              </div>
            ),
          )}
          <div ref={bottomRef} />
        </div>
      )}
    </div>
  )
}

function AuraMessageCard({
  message,
  currentUsername,
  showNew,
  onReveal,
  onAnalyze,
}: {
  message: ChatMessage
  currentUsername: string
  showNew?: boolean
  onReveal?: (audio: SelectedAudio) => void
  onAnalyze?: (audio: SelectedAudio) => void
}) {
  const isOwn = message.sender === currentUsername
  const segments = (message.segments || [])
    .slice()
    .sort((a, b) => (a.segmentIndex ?? a.segment_index ?? 0) - (b.segmentIndex ?? b.segment_index ?? 0))
  const selected: SelectedAudio = {
    messageId: message.messageId || message.id,
    audioUrl: message.audioUrl,
    fileName: message.metadata?.file_name || `${message.messageId || message.id}.wav`,
    source: 'Chat',
    mode: message.mode,
    transmissionId: message.transmissionId,
    totalSegments: message.totalSegments,
    segments,
    metadata: message.metadata,
    analysisSourceType: message.type === 'audio_group' ? 'grouped' : 'single',
    selectedPartNumber: message.type === 'audio_group' ? 1 : undefined,
    selectedPartFilename:
      message.type === 'audio_group'
        ? segments[0]?.fileName || segments[0]?.stego_file_name
        : message.metadata?.file_name || `${message.messageId || message.id}.wav`,
  }

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
      <div className="w-full max-w-[640px] rounded-2xl bg-[linear-gradient(180deg,rgba(var(--aura-surface),0.88),rgba(var(--aura-surface-soft),0.68))] px-3.5 py-3 shadow-[0_10px_28px_rgba(0,0,0,0.10)] ring-1 ring-aura-border/8">
        <div className="mb-2.5 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-aura-reveal/10">
                <Radio size={14} className="text-aura-reveal" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-semibold text-aura-text">
                    {message.type === 'audio_group' ? 'Aura Transmission' : 'Secure audio'}
                  </span>
                  {showNew ? <Badge tone="safe">New</Badge> : null}
                </div>
                <p className="mt-0.5 text-[11px] text-aura-dim">
                  {message.type === 'audio_group'
                    ? `${segments.length} Parts • Sent in exact order`
                    : `${isOwn ? 'Sent' : 'Received'} • ${message.createdAt}`}
                </p>
              </div>
            </div>
          </div>
        </div>

        {message.type === 'audio_group' ? (
          <div className="grid gap-2">
            {segments.map((segment, idx) => (
              <div key={segment.fileName} className="rounded-lg border border-aura-border/10 bg-aura-bg/28 p-2">
                <div className="mb-1 text-[12px] font-medium text-aura-text">Part {idx + 1} of {segments.length}</div>
                <audio controls src={resolveUrl(segment.audioUrl)} className="h-9 w-full" />
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-aura-border/8 bg-aura-bg/28 p-2">
            <audio controls src={message.audioUrl ? resolveUrl(message.audioUrl) : undefined} className="h-9 w-full" />
          </div>
        )}

        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => onReveal?.(selected)}
            className="inline-flex items-center rounded-xl border border-aura-reveal/20 bg-aura-reveal/10 px-3 py-1.5 text-[12px] font-semibold text-aura-reveal transition-colors hover:bg-aura-reveal/14"
          >
            <FlaskConical size={13} className="mr-1.5" />
            Reveal
          </button>
          <button
            type="button"
            onClick={() => onAnalyze?.(selected)}
            className="inline-flex items-center rounded-xl border border-aura-border/10 bg-aura-bg/35 px-3 py-1.5 text-[12px] font-medium text-aura-text transition-colors hover:bg-aura-bg/50"
          >
            <BarChart3 size={13} className="mr-1.5" />
            Analysis
          </button>
          <a
            href={resolveUrl(message.audioUrl || segments[0]?.audioUrl || '')}
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
