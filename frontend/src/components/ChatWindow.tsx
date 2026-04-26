import { useEffect, useRef } from 'react'
import { FileCard } from './FileCard'
import { MessageBubble } from './MessageBubble'
import type { ConversationItem, SelectedAudio } from '../types'

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