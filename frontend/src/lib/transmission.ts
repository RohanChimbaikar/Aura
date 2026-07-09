import type { SelectedAudio } from '../types'

// Converts an ArrayBuffer to a Base64 string (browser compatible)
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  const len = bytes.byteLength
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return window.btoa(binary)
}

// Converts a Base64 string to an ArrayBuffer
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = window.atob(base64)
  const len = binaryString.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes.buffer
}

// Computes the SHA-256 checksum of an ArrayBuffer
export async function computeHash(buffer: ArrayBuffer): Promise<string> {
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Downloads a raw WAV file as a native blob download (remaining inside the SPA)
export async function downloadWavFile(audioUrl: string, fileName: string) {
  const response = await fetch(audioUrl, { credentials: 'include' })
  if (!response.ok) throw new Error('Failed to fetch audio file.')
  const blob = await response.blob()
  const downloadUrl = URL.createObjectURL(blob)
  
  const link = document.createElement('a')
  link.href = downloadUrl
  link.download = fileName.endsWith('.wav') ? fileName : fileName + '.wav'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(downloadUrl)
}

// Packs audio and metadata into a .aura package and triggers a Blob download
export async function exportAuraPackage(
  audioUrl: string,
  fileName: string,
  metadataProps: {
    transmissionId?: string
    sender?: string
    recipient?: string
    createdAt?: string
    carrier?: string
    parts?: number
    mode?: string
    reuse?: boolean
    duration?: number
    version?: number
    analysis?: Record<string, any>
  }
) {
  const response = await fetch(audioUrl, { credentials: 'include' })
  if (!response.ok) throw new Error('Failed to fetch audio file.')
  const arrayBuffer = await response.arrayBuffer()
  const hash = await computeHash(arrayBuffer)
  const audioBase64 = arrayBufferToBase64(arrayBuffer)

  const pkg = {
    version: metadataProps.version ?? 2,
    transmission_id: metadataProps.transmissionId ?? '',
    sender: metadataProps.sender ?? '',
    recipient: metadataProps.recipient ?? '',
    created_at: metadataProps.createdAt ?? new Date().toISOString(),
    carrier: metadataProps.carrier ?? '',
    parts: metadataProps.parts ?? 1,
    mode: metadataProps.mode ?? 'single',
    reuse: metadataProps.reuse ?? false,
    duration: metadataProps.duration ?? 0,
    audio_base64: audioBase64,
    analysis: metadataProps.analysis ?? {},
    checksum: hash,
    hash: hash
  }

  const pkgString = JSON.stringify(pkg, null, 2)
  const blob = new Blob([pkgString], { type: 'application/json' })
  const downloadUrl = URL.createObjectURL(blob)
  
  const link = document.createElement('a')
  link.href = downloadUrl
  link.download = fileName.replace(/\.wav$/i, '') + '.aura'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(downloadUrl)
}

// Unpacks a .aura package into its constituent audio file blob and metadata object
export function importAuraPackage(file: File): Promise<{ audioBlob: Blob; metadata: any }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        const text = reader.result as string
        const parsed = JSON.parse(text)
        
        if (!parsed || typeof parsed !== 'object' || !parsed.audio_base64) {
          reject(new Error('Invalid Aura package format.'))
          return
        }

        const arrayBuffer = base64ToArrayBuffer(parsed.audio_base64)
        const audioBlob = new Blob([arrayBuffer], { type: 'audio/wav' })
        
        resolve({
          audioBlob,
          metadata: parsed
        })
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsText(file)
  })
}

// Attempts metadata recovery for raw WAV files based on filename matches
export function attemptMetadataRecovery(
  fileName: string,
  availableAudio: SelectedAudio[]
): SelectedAudio['metadata'] | null {
  // 1. Try to find an exact match in the availableAudio array
  const matchByName = availableAudio.find(
    (audio) => audio.fileName === fileName || audio.selectedPartFilename === fileName
  )
  if (matchByName && matchByName.metadata) {
    return matchByName.metadata
  }

  // 2. Extract transmission ID from filename and find matches
  const txIdMatch = fileName.match(/tx_([a-zA-Z0-9]+)/i)
  if (txIdMatch) {
    const txId = txIdMatch[1]
    const matchByTxId = availableAudio.find(
      (audio) => audio.transmissionId === txId || audio.metadata?.transmission_id === txId
    )
    if (matchByTxId && matchByTxId.metadata) {
      return matchByTxId.metadata
    }
  }

  return null
}
