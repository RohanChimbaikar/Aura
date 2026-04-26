import { ArrowUpRight, Download } from 'lucide-react'
import { FileCard } from '../components/FileCard'
import { SurfacePanel } from '../components/SurfacePanel'
import { getDownloadUrl } from '../services/api'
import type { AudioTransfer, User } from '../types'

type Props = {
  currentUser: User
  files: AudioTransfer[]
  onOpenChat: (username: string) => void
}

export function InboxScreen({ currentUser, files, onOpenChat }: Props) {
  const latest = files[0]

  return (
    <div className="grid gap-6 xl:grid-cols-[1.22fr_0.88fr]">
      <SurfacePanel className="p-5">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-aura-dim">
              Received audio files
            </div>
            <div className="mt-1.5 text-[18px] font-medium text-aura-text">
              {currentUser.username} inbox
            </div>
          </div>
          <div className="rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-2 text-sm text-aura-muted">
            {files.length} received WAV {files.length === 1 ? 'item' : 'items'}
          </div>
        </div>

        <div className="space-y-3">
          {files.length === 0 ? (
            <div className="rounded-[22px] border border-dashed border-white/10 px-5 py-10 text-center text-sm text-aura-muted">
              No WAV transfers received yet. Incoming files will appear here instantly.
            </div>
          ) : (
            files.map((file) => (
              <FileCard
                key={file.id}
                transfer={file}
                currentUsername={currentUser.username}
              />
            ))
          )}
        </div>
      </SurfacePanel>

      <SurfacePanel className="p-6">
        <div className="text-[11px] uppercase tracking-[0.24em] text-aura-dim">
          Latest transfer
        </div>

        {latest ? (
          <>
            <div className="mt-3 text-xl font-medium text-aura-text">
              {latest.originalFilename}
            </div>
            <p className="mt-3 text-sm leading-6 text-aura-muted">
              WAV received from {latest.sender}. Download it here, then run your
              fixed Aura decode pipeline locally with the matching decoder checkpoint
              and config.
            </p>

            <div className="mt-8 space-y-4 border-t border-white/6 pt-6">
              <div className="flex items-center justify-between">
                <span className="text-sm text-aura-muted">Sender</span>
                <span className="font-mono text-sm text-aura-text">
                  {latest.sender}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-aura-muted">Received</span>
                <span className="font-mono text-sm text-aura-text">
                  {new Date(latest.createdAt).toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-aura-muted">File size</span>
                <span className="font-mono text-sm text-aura-text">
                  {(latest.fileSize / 1024 / 1024).toFixed(2)} MB
                </span>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href={getDownloadUrl(latest.id)}
                className="inline-flex items-center gap-2 rounded-[18px] border border-aura-accent/30 bg-aura-accentSoft/15 px-4 py-3 text-sm font-medium text-aura-text transition-colors hover:bg-aura-accent/18"
              >
                <Download size={15} />
                Download WAV
              </a>

              <button
                type="button"
                onClick={() => onOpenChat(latest.sender)}
                className="inline-flex items-center gap-2 rounded-[18px] border border-aura-border/16 bg-aura-surface/35 px-4 py-3 text-sm font-medium text-aura-text transition-colors hover:bg-aura-surface/55"
              >
                <ArrowUpRight size={15} />
                Open channel
              </button>
            </div>
          </>
        ) : (
          <p className="mt-3 text-sm leading-6 text-aura-muted">
            Select a live chat recipient and send a stego WAV to populate the inbox.
          </p>
        )}
      </SurfacePanel>
    </div>
  )
}
