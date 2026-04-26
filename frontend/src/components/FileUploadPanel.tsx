import { useState } from 'react'
import { LoaderCircle, Upload } from 'lucide-react'
import { PrimaryActionButton } from './ActionButtons'
import { SurfacePanel } from './SurfacePanel'

type Props = {
  recipient: string
  disabled?: boolean
  onUpload: (file: File) => Promise<void>
}

export function FileUploadPanel({
  recipient,
  disabled = false,
  onUpload,
}: Props) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [status, setStatus] = useState('')
  const [uploading, setUploading] = useState(false)

  async function handleUpload() {
    if (!selectedFile || disabled) return
    setUploading(true)
    setStatus('Uploading WAV and notifying recipient...')
    try {
      await onUpload(selectedFile)
      setStatus('Stego audio sent successfully.')
      setSelectedFile(null)
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <SurfacePanel className="p-5">
      <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-aura-dim">
        Send stego audio
      </div>
      <div className="mt-2 text-[18px] font-medium text-aura-text">
        HTTP upload to {recipient || 'selected recipient'}
      </div>
      <p className="mt-3 text-sm leading-6 text-aura-muted">
        Choose the stego WAV produced by your fixed Aura pipeline. The actual file
        moves over `multipart/form-data`, then a live event updates both users.
      </p>

      <label className="mt-5 block rounded-[24px] border border-dashed border-aura-border/18 bg-white/[0.02] p-5">
        <div className="text-sm font-medium text-aura-text">WAV file</div>
        <div className="mt-2 text-sm text-aura-muted">
          Only `.wav` files are accepted.
        </div>
        <input
          type="file"
          accept=".wav,audio/wav"
          disabled={disabled || uploading}
          onChange={(event) => {
            const nextFile = event.target.files?.[0] ?? null
            setSelectedFile(nextFile)
            setStatus(nextFile ? `Ready to send ${nextFile.name}` : '')
          }}
          className="mt-4 block w-full text-sm text-aura-muted file:mr-4 file:rounded-full file:border-0 file:bg-aura-accentSoft/16 file:px-4 file:py-2 file:text-sm file:font-medium file:text-aura-text"
        />
      </label>

      {status ? (
        <div className="mt-4 rounded-[18px] border border-white/8 bg-white/[0.03] px-4 py-3 text-sm text-aura-muted">
          {status}
        </div>
      ) : null}

      <PrimaryActionButton
        type="button"
        disabled={disabled || uploading || !selectedFile}
        onClick={handleUpload}
        className="mt-5 w-full"
      >
        {uploading ? (
          <LoaderCircle size={16} className="mr-2 animate-spin" />
        ) : (
          <Upload size={16} className="mr-2" />
        )}
        {uploading ? 'Sending...' : 'Send stego audio'}
      </PrimaryActionButton>
    </SurfacePanel>
  )
}
