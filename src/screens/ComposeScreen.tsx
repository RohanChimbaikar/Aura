import { AlertCircle } from 'lucide-react'
import { ChatWindow } from '../components/ChatWindow'
import { ConnectionStatus } from '../components/ConnectionStatus'
import { FileUploadPanel } from '../components/FileUploadPanel'
import { MessageComposer } from '../components/MessageComposer'
import { SurfacePanel } from '../components/SurfacePanel'
import type {
  ConnectionState,
  ConversationItem,
  SelectedAudio,
  User,
} from '../types'

type Props = {
  currentUser: User
  users: User[]
  selectedRecipient: string
  onSelectRecipient: (username: string) => void
  conversationItems: ConversationItem[]
  connectionState: ConnectionState
  onSendMessage: (content: string) => void
  onUploadFile: (file: File) => Promise<void>
  onRevealAudio: (audio: SelectedAudio) => void
  onAnalyzeAudio: (audio: SelectedAudio) => void
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
    <div className="grid gap-5 xl:grid-cols-[1.45fr_0.85fr]">
      <SurfacePanel className="p-0">
        <div className="flex flex-col border-b border-white/6 px-6 py-5 lg:flex-row lg:items-center lg:justify-between lg:px-7">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-aura-dim">
              Active channel
            </div>
            <div className="mt-2 text-[22px] font-medium text-aura-text">
              {selectedRecipient || 'Select recipient'}
            </div>
            <p className="mt-2 text-sm leading-6 text-aura-muted">
              Logged in as {currentUser.username}. Text travels over Socket.IO;
              WAV transfer stays on HTTP upload/download.
            </p>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 lg:mt-0">
            <ConnectionStatus state={connectionState} />

            <select
              value={selectedRecipient}
              onChange={(event) => onSelectRecipient(event.target.value)}
              className="rounded-[18px] border border-aura-border/18 bg-aura-surface/55 px-4 py-3 text-sm text-aura-text outline-none transition-colors focus:border-aura-accent/45"
            >
              {users.length === 0 ? <option value="">No recipients</option> : null}
              {users.map((user) => (
                <option key={user.id} value={user.username}>
                  {user.username}
                </option>
              ))}
            </select>
          </div>
        </div>

        <ChatWindow
          items={conversationItems}
          currentUsername={currentUser.username}
          onRevealAudio={onRevealAudio}
          onAnalyzeAudio={onAnalyzeAudio}
          emptyState={
            selectedRecipient
              ? 'No messages in this channel yet. Start with a text message or send a stego WAV.'
              : 'Choose a recipient to open the secure channel.'
          }
        />

        <div className="border-t border-white/6 px-6 py-5 lg:px-7">
          {error ? (
            <div className="mb-4 flex items-center gap-2 rounded-[18px] border border-aura-danger/25 bg-aura-danger/10 px-4 py-3 text-sm text-aura-danger">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          ) : null}

          <MessageComposer
            disabled={!selectedRecipient}
            onSend={onSendMessage}
            recipient={selectedRecipient}
          />
        </div>
      </SurfacePanel>

      <div className="space-y-5">
        <FileUploadPanel
          recipient={selectedRecipient}
          disabled={!selectedRecipient}
          onUpload={onUploadFile}
        />

        <SurfacePanel className="p-5">
          <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-aura-dim">
            Aura decode note
          </div>
          <div className="mt-2 text-[18px] font-medium text-aura-text">
            Receiver-side recovery still depends on your fixed model pipeline
          </div>
          <p className="mt-3 text-sm leading-6 text-aura-muted">
            This layer only transports the stego WAV and metadata. Decoding still
            requires the received WAV, the matching decoder checkpoint, and the same
            config used by your existing Aura integration.
          </p>

          <div className="mt-5 rounded-[22px] border border-white/8 bg-white/[0.03] p-4">
            <div className="grid gap-3 text-sm text-aura-muted">
              <div className="flex items-center justify-between gap-3">
                <span>Realtime text</span>
                <span className="font-mono text-aura-text">Socket.IO</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>WAV upload</span>
                <span className="font-mono text-aura-text">HTTP POST</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span>WAV download</span>
                <span className="font-mono text-aura-text">HTTP GET</span>
              </div>
            </div>
          </div>
        </SurfacePanel>
      </div>
    </div>
  )
}