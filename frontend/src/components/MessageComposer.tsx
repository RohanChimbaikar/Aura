import { useRef, useState } from 'react'
import { FileAudio, LoaderCircle, Paperclip, SendHorizonal, X } from 'lucide-react'
import { PrimaryActionButton, SecondaryActionButton } from './ActionButtons'

type Props = {
  recipient: string
  disabled?: boolean
  onSend: (content: string) => void
  onUpload: (file: File) => Promise<void>
}

export function MessageComposer({
  recipient,
  disabled = false,
  onSend,
  onUpload,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const [value, setValue] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [sending, setSending] = useState(false)
  const [status, setStatus] = useState('')

  const canSend = Boolean(value.trim() || selectedFile) && !disabled && !sending

  async function submit() {
    const trimmed = value.trim()
    if (!canSend) return

    setSending(true)
    setStatus('')

    try {
      if (trimmed) {
        onSend(trimmed)
        setValue('')
      }

      if (selectedFile) {
        setStatus('Uploading WAV...')
        await onUpload(selectedFile)
        setSelectedFile(null)
        if (inputRef.current) inputRef.current.value = ''
      }

      setStatus(selectedFile ? 'Sent.' : '')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Send failed.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="mx-auto max-w-[1180px] rounded-2xl border border-aura-border/10 bg-aura-bg/62 p-2 shadow-[0_12px_34px_rgba(0,0,0,0.16)]">
      {selectedFile ? (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-aura-accent/14 bg-aura-accentSoft/7 px-3 py-1.5">
          <div className="flex min-w-0 items-center gap-2 text-sm text-aura-text">
            <FileAudio size={16} className="shrink-0 text-aura-accent" />
            <span className="truncate font-medium">{selectedFile.name}</span>
            <span className="rounded-full border border-aura-accent/14 bg-aura-accentSoft/8 px-2 py-0.5 text-[10px] font-medium text-aura-muted">
              Stego WAV
            </span>
            <span className="font-mono text-[11px] text-aura-dim">
              {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setSelectedFile(null)
              setStatus('')
              if (inputRef.current) inputRef.current.value = ''
            }}
            className="rounded-full p-1 text-aura-dim transition-colors hover:bg-white/8 hover:text-aura-text"
            aria-label="Remove selected WAV"
            disabled={sending}
          >
            <X size={15} />
          </button>
        </div>
      ) : null}

      {status ? (
        <div className="mb-2 px-2 text-xs text-aura-muted">{status}</div>
      ) : null}

      <div className="flex items-end gap-2">
        <input
          ref={inputRef}
          type="file"
          accept=".wav,audio/wav"
          className="hidden"
          disabled={disabled || sending}
          onChange={(event) => {
            const nextFile = event.target.files?.[0] ?? null
            setSelectedFile(nextFile)
            setStatus(nextFile ? 'WAV attached.' : '')
          }}
        />

        <SecondaryActionButton
          type="button"
          disabled={disabled || sending}
          onClick={() => inputRef.current?.click()}
          className="shrink-0 rounded-xl px-3.5 py-2.5"
        >
          <Paperclip size={15} className="mr-2" />
          Attach WAV
        </SecondaryActionButton>

        <textarea
          rows={1}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              submit()
            }
          }}
          placeholder={
            disabled
              ? 'Select a recipient to open the chat channel.'
              : `Message ${recipient}...`
          }
          className="min-h-[40px] flex-1 resize-none border-none bg-transparent px-2 py-2 text-[14px] leading-6 text-aura-text outline-none placeholder:text-aura-dim disabled:cursor-not-allowed disabled:opacity-60"
          disabled={disabled || sending}
        />

        <PrimaryActionButton
          type="button"
          onClick={submit}
          disabled={!canSend}
          className="shrink-0 rounded-xl px-4 py-2.5 disabled:opacity-45"
        >
          {sending ? (
            <LoaderCircle size={15} className="mr-2 animate-spin" />
          ) : (
            <SendHorizonal size={15} className="mr-2" />
          )}
          Send
        </PrimaryActionButton>
      </div>
    </div>
  )
}
