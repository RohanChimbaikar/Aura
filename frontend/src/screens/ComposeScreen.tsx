import { AlertCircle, BellDot, Search, ShieldCheck } from 'lucide-react'
import { ChatWindow } from '../components/ChatWindow'
import { ConnectionStatus } from '../components/ConnectionStatus'
import { MessageComposer } from '../components/MessageComposer'
import type { ConnectionState, ConversationItem, SelectedAudio, User } from '../types'

type Props = {
  currentUser: User
  users: User[]
  selectedRecipient: string
  onSelectRecipient: (username: string) => void
  conversationItems: ConversationItem[]
  connectionState: ConnectionState
  onSendMessage: (content: string) => void
  onUploadFile: (file: File) => Promise<void>
  onRevealAudio?: (audio: SelectedAudio) => void
  onAnalyzeAudio?: (audio: SelectedAudio) => void
  error: string
}

export function ComposeScreen({
  currentUser,
  users,
  selectedRecipient,
  onSelectRecipient,
  conversationItems,
  connectionState,
  onSendMessage,
  onUploadFile,
  onRevealAudio,
  onAnalyzeAudio,
  error,
}: Props) {
  return (
    <section className="flex h-full min-h-0 min-w-0 flex-col bg-[linear-gradient(180deg,rgba(var(--aura-surface-soft),0.62),rgba(var(--aura-bg),0.96))]">
      <header className="flex h-[76px] shrink-0 items-center justify-between gap-4 border-b border-aura-border/8 bg-aura-surface/58 px-5 shadow-[0_1px_0_rgba(255,255,255,0.035)] backdrop-blur-xl lg:px-7">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2.5">
            <h1 className="truncate text-[21px] font-semibold text-aura-text">
              {selectedRecipient || 'Select recipient'}
            </h1>
            <ConnectionStatus state={connectionState} />
          </div>
          <div className="mt-1 truncate text-[13px] leading-5 text-aura-muted">
            {currentUser.username}
            {selectedRecipient ? ` -> ${selectedRecipient}` : ''} - encrypted session active
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="hidden h-9 items-center gap-2 rounded-xl border border-aura-border/10 bg-aura-bg/35 px-3 lg:flex">
            <Search size={13} className="text-aura-dim" />
            <span className="text-[12px] text-aura-dim">Search</span>
          </div>

          <select
            value={selectedRecipient}
            onChange={(event) => onSelectRecipient(event.target.value)}
            className="h-9 rounded-xl border border-aura-border/10 bg-aura-bg/35 px-3 text-[13px] text-aura-text outline-none transition-colors focus:border-aura-accent/45"
          >
            {users.length === 0 ? <option value="">No recipients</option> : null}
            {users.map((user) => (
              <option key={user.id} value={user.username}>
                {user.username}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-aura-border/10 bg-aura-bg/35 text-aura-muted transition-colors hover:text-aura-text"
            aria-label="Notifications"
          >
            <BellDot size={14} />
          </button>

          <div className="hidden h-9 items-center gap-2 rounded-xl border border-aura-reveal/18 bg-aura-reveal/10 px-3 text-aura-reveal shadow-[0_8px_22px_rgba(0,0,0,0.08)] sm:flex">
            <ShieldCheck size={13} />
            <span className="text-[12px] font-semibold">Verified</span>
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0">
        <ChatWindow
          items={conversationItems}
          currentUsername={currentUser.username}
          selectedRecipient={selectedRecipient}
          emptyState={
            selectedRecipient
              ? 'No messages yet. Send text or attach a stego WAV below.'
              : 'Choose a recipient to open the secure channel.'
          }
          onRevealAudio={onRevealAudio}
          onAnalyzeAudio={onAnalyzeAudio}
        />
      </div>

      <footer className="shrink-0 border-t border-aura-border/8 bg-aura-surface/78 px-5 py-2.5 shadow-[0_-18px_42px_rgba(0,0,0,0.16)] backdrop-blur-xl lg:px-7">
        {error ? (
          <div className="mb-2 flex items-center gap-2 rounded-[14px] border border-aura-danger/25 bg-aura-danger/10 px-3 py-2 text-sm text-aura-danger">
            <AlertCircle size={15} />
            <span>{error}</span>
          </div>
        ) : null}

        <MessageComposer
          disabled={!selectedRecipient}
          onSend={onSendMessage}
          onUpload={onUploadFile}
          recipient={selectedRecipient}
        />
      </footer>
    </section>
  )
}
