export type NavKey = 'chat' | 'encode' | 'reveal' | 'analysis' | 'settings'

export type ScreenFrame = {
  title: string
  subtitle: string
  eyebrow?: string
}

export type EncodePreview = {
  success: boolean
  message_length: number
  header_bytes: number
  header_nibbles: number
  header_chunks: number
  payload_nibbles: number
  payload_chunks: number
  required_chunks: number
  required_seconds: number
  required_minutes: number
  mode: 'safe_dynamic'
  carrier_alias: string
  carrier_path?: string
  carrier_duration_sec: number
  safe_status: 'safe' | 'unsafe'
}

export type EncodeResult = EncodePreview & {
  message_id: string
  audio_url: string
  file_name: string
  carrier_path: string
  protection: 'length_header_repeat3'
}

export type DecodeChange = {
  from: string
  to: string
  type?: string
}

export type DecodeResult = {
  success: boolean
  message_id: string
  audio_url: string
  file_name: string
  audio_duration_sec: number
  sample_rate: number
  channels: number
  total_chunks: number
  header_chunks: number
  header_voted_nibbles: number
  decoded_message_length: number
  payload_chunks_needed: number
  total_needed_chunks: number
  ignored_tail_chunks: number
  header_valid: boolean
  raw_text: string
  corrected_text: string
  recoveredText?: string
  changes: DecodeChange[]
  recovery_status: 'exact' | 'minor_corrected' | 'boundary_repair' | 'low_confidence'
}

export type ChatMessage = {
  id: string
  type: 'audio' | 'text'
  direction: 'incoming' | 'outgoing'
  sender?: string
  receiver?: string
  createdAt: string
  text?: string
  audioUrl?: string
  messageId?: string
  metadata?: Partial<EncodeResult>
}

export type AnalysisPayload = {
  message_id: string
  signal: {
    file_name: string
    source: 'generated' | 'uploaded'
    duration: number | null
    durationSec: number | null
    sample_rate: number
    sampleRate: number
    channels: number
    total_chunks: number | null
    waveform: number[]
    spectrogram: {
      timeBins: number
      freqBins: number
      values: number[][]
    }
    differenceWaveform: number[]
  }
  payload: {
    header_mode_enabled: boolean
    header_bytes: number
    header_nibbles: number
    header_chunks: number
    payload_mode: string
    protection: string
    chunk_duration: number
  }
  encode: Partial<EncodeResult> | null
  decode: Partial<DecodeResult> | null
  recovery: {
    corrected_text: string | null
    raw_text: string | null
    changes: DecodeChange[]
    recovery_status: string | null
  }
}

export type SelectedAudio = {
  messageId: string
  audioUrl: string
  fileName: string
  source: 'Chat' | 'Encode' | 'Uploaded'
  metadata?: Partial<EncodeResult>
}

export type User = {
  id: number
  username: string
  createdAt?: string
}

export type ConnectionState = 'connecting' | 'connected' | 'disconnected'

export type Message = {
  id: number
  sender: string
  receiver: string
  content: string
  createdAt: string
  kind?: 'text'
}

export type AudioTransfer = {
  id: number | string
  sender: string
  receiver: string
  originalFilename: string
  storedFilename?: string
  fileSize: number
  createdAt: string
  kind?: 'file'
  source?: 'upload' | 'aura'
  audioUrl?: string
  messageId?: string
  metadata?: Partial<EncodeResult>
}

export type ConversationItem =
  | {
      type: 'message'
      id: string
      timestamp: string
      message: Message
    }
  | {
      type: 'file'
      id: string
      timestamp: string
      transfer: AudioTransfer
    }

export type InboxStatus = 'Verified' | 'Pending Reveal' | 'Encrypted'
