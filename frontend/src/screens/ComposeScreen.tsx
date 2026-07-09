import { AlertCircle, BellDot, ShieldCheck, Radar } from 'lucide-react'
import { ChatWindow } from '../components/ChatWindow'
import { ConnectionStatus } from '../components/ConnectionStatus'
import { MessageComposer } from '../components/MessageComposer'
import type { ConnectionState, ConversationItem, SelectedAudio, User } from '../types'

type Props = {
  currentUser: User
  users: User[]
  selectedRecipient: string
  conversationItems: ConversationItem[]
  connectionState: ConnectionState
  onSendMessage: (content: string) => void
  onUploadFile: (file: File) => Promise<void>
  onRevealAudio?: (audio: SelectedAudio) => void
  onAnalyzeAudio?: (audio: SelectedAudio) => void
  onDownloadPackage?: (audio: SelectedAudio) => void
  onForward?: (audio: SelectedAudio) => void
  onShowDetails?: (audio: SelectedAudio) => void
  onDeleteMessage?: (messageId: string) => void
  error: string
  onlineUsers: Set<string>
}

export function ComposeScreen({
  currentUser,
  users,
  selectedRecipient,
  conversationItems,
  connectionState,
  onSendMessage,
  onUploadFile,
  onRevealAudio,
  onAnalyzeAudio,
  onDownloadPackage,
  onForward,
  onShowDetails,
  onDeleteMessage,
  error,
  onlineUsers,
}: Props) {
  // Find selected user details
  const selectedUser = users.find((u) => u.username === selectedRecipient)
  const isOnline = onlineUsers.has(selectedRecipient)
  const displayName = selectedUser?.name || selectedRecipient

  // If no conversation is active, render the empty state workspace dashboard
  if (!selectedRecipient) {
    return (
      <section className="flex h-full flex-col items-center justify-center bg-[linear-gradient(180deg,rgba(var(--aura-surface-soft),0.62),rgba(var(--aura-bg),0.96))] px-6 text-center text-aura-muted">
        <div className="relative mb-6">
          <div className="absolute -inset-1 rounded-full bg-gradient-to-r from-aura-accent/20 to-aura-reveal/20 blur-xl opacity-75 animate-pulse"></div>
          <div className="relative flex h-20 w-20 items-center justify-center rounded-full border border-white/8 bg-aura-surface/80 text-aura-accent shadow-lg">
            <Radar size={40} className="animate-pulse" />
          </div>
        </div>
        <h2 className="text-xl font-medium text-aura-text tracking-tight">Secure Steganography Workspace</h2>
        <p className="mt-2.5 max-w-sm text-sm text-aura-muted leading-6">
          Select an operator from the sidebar to establish a secure, steganographically-encoded channel.
        </p>
      </section>
    )
  }

  return (
    <section className="flex h-full flex-col min-w-0 bg-[linear-gradient(180deg,rgba(var(--aura-surface-soft),0.34),rgba(var(--aura-bg),0.88))]">
      {/* Active Conversation Header */}
      <header className="shrink-0 flex h-[68px] items-center justify-between border-b border-aura-border/8 bg-aura-surface/65 px-5 shadow-sm backdrop-blur-xl lg:px-7">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="relative flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-aura-accent/14 to-aura-reveal/14 text-[12px] font-semibold text-aura-text border border-white/5 shadow-inner">
            {displayName.substring(0, 2).toUpperCase()}
            <span
              className={`absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border border-aura-surface ${
                isOnline ? 'bg-emerald-500' : 'bg-aura-dim'
              }`}
            />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-[15px] font-bold text-aura-text tracking-tight">
                {displayName}
              </h2>
              {isOnline && (
                <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-medium">
                  online
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate text-[11px] text-aura-muted">
              Secure steganographic node &bull; AES-GCM
            </p>
          </div>
        </div>

        {/* Header toolbar Actions */}
        <div className="flex items-center gap-2">
          <ConnectionStatus state={connectionState} />

          <div className="h-4 w-px bg-aura-border/12" />

          <div className="flex items-center gap-1.5 rounded-xl border border-aura-border/8 bg-aura-bg/24 p-0.5">
            <span className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-aura-reveal">
              <ShieldCheck size={13} />
              Secured Channel
            </span>
          </div>

          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-aura-border/10 bg-aura-bg/35 text-aura-muted transition-colors hover:text-aura-text hover:bg-white/[0.03]"
            aria-label="Toggle notifications"
          >
            <BellDot size={14} />
          </button>
        </div>
      </header>

      {/* Chat Transcript Window */}
      <div className="flex-1 min-h-0">
        <ChatWindow
          items={conversationItems}
          currentUsername={currentUser.username}
          selectedRecipient={selectedRecipient}
          emptyState="No messages yet. Send text or attach a stego WAV below."
          onRevealAudio={onRevealAudio}
          onAnalyzeAudio={onAnalyzeAudio}
          onDownloadPackage={onDownloadPackage}
          onForward={onForward}
          onShowDetails={onShowDetails}
          onDeleteMessage={onDeleteMessage}
        />
      </div>

      {/* Message Composer Footer */}
      <footer className="shrink-0 border-t border-aura-border/8 bg-aura-surface/78 px-5 py-3 shadow-[0_-18px_42px_rgba(0,0,0,0.18)] backdrop-blur-xl lg:px-7">
        {error ? (
          <div className="mb-2.5 flex items-center gap-2 rounded-[14px] border border-aura-danger/25 bg-aura-danger/10 px-3 py-2 text-xs text-aura-danger">
            <AlertCircle size={14} />
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
