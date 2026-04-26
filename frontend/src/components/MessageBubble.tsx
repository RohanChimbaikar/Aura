import { cn } from '../lib/utils'
import type { Message } from '../types'

type Props = {
  message: Message
  isOwn: boolean
}

function getMessageTime(message: Message) {
  const date = new Date(message.createdAt)
  if (Number.isNaN(date.getTime())) return ''

  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function MessageBubble({ message, isOwn }: Props) {
  const timeLabel = getMessageTime(message)

  return (
    <div className={cn('flex w-full', isOwn ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'w-fit max-w-[min(420px,78%)] rounded-2xl px-4 py-2.5 shadow-[0_8px_22px_rgba(0,0,0,0.08)]',
          isOwn
            ? 'rounded-br-md bg-aura-accentSoft/12 text-aura-text ring-1 ring-aura-accent/16'
            : 'rounded-bl-md bg-aura-surface/82 text-aura-text ring-1 ring-aura-border/8',
        )}
      >
        <div className="break-words text-[14px] leading-6">{message.content}</div>

        {timeLabel ? (
          <div className="mt-1.5 text-right font-mono text-[10px] text-aura-dim">
            {timeLabel}
          </div>
        ) : null}
      </div>
    </div>
  )
}