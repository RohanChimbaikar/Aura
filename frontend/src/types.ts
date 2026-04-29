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
  mode: 'safe_dynamic' | 'single' | 'multi' | 'exceeded'
  carrier_alias: string
  carrier_path?: string
  carrier_duration_sec: number
  safe_status: 'safe' | 'unsafe'
  plan?: {
    mode: 'single' | 'multi' | 'exceeded'
    carrierReuseEnabled?: boolean
    messageChars: number
    messageBytes: number
    requiredChunks: number
    requiredSeconds: number
    requiredMinutes: number
    singleCarrierCandidate: Record<string, unknown> | null
    segments: Array<{
      segmentIndex: number
      carrierId: string
      carrierName: string
      carrierDurationSec: number
      carrierDurationMin: number
      usablePayloadBytes: number
      assignedPayloadBytes: number
      estimatedChunks: number
      estimatedSeconds: number
    }>
    uniqueCarriersUsed?: number
    reusedCarrierCount?: number
    totalSegments: number
    totalAssignedPayloadBytes: number
    totalAvailablePayloadBytes: number
    totalDurationSec: number
    totalDurationMin: number
    poolExceeded: boolean
    exceededReason?: 'segment_cap' | 'duration_cap' | 'capacity_cap'
  }
}

export type EncodeResult = EncodePreview & {
  mode?: 'safe_dynamic' | 'single' | 'multi' | 'exceeded'
  message_id: string
  audio_url: string
  file_name: string
  carrier_path: string
  protection: 'length_header_repeat3'
  transmission_id?: string
  total_segments?: number
  segments?: AudioSegment[]
  manifest?: Record<string, unknown>
  manifest_file_name?: string
}

export type DecodeChange = {
  from: string
  to: string
  type?: string
}

export type DecodeResult = {
  success: boolean
  mode?: 'single' | 'multi'
  message_id?: string
  audio_url?: string
  file_name?: string
  audio_duration_sec?: number
  sample_rate?: number
  channels?: number
  total_chunks?: number
  header_chunks?: number
  header_voted_nibbles?: number
  decoded_message_length?: number
  payload_chunks_needed?: number
  total_needed_chunks?: number
  ignored_tail_chunks?: number
  header_valid?: boolean
  raw_text: string
  corrected_text: string
  recoveredText?: string
  recovered_text?: string
  transmission_id?: string
  total_segments?: number
  received_segments?: number
  missing_segments?: number[]
  segments?: Array<{
    segment_index: number
    file_name: string
    audio_url?: string
    decoded_text?: string
  }>
  error?: string
  recovery_status: 'complete' | 'incomplete' | 'failed' | 'exact' | 'minor_corrected' | 'boundary_repair' | 'low_confidence'
  changes: DecodeChange[]
}

export type AudioSegment = {
  segmentIndex?: number
  segment_index?: number
  totalSegments?: number
  audioUrl?: string
  audio_url?: string
  fileName?: string
  stego_file_name?: string
  carrierName?: string
  carrier_name?: string
  carrierDurationSec?: number
  carrier_duration_sec?: number
}

export type ChatMessage = {
  id: string
  type: 'audio' | 'audio_group' | 'text'
  direction: 'incoming' | 'outgoing'
  sender?: string
  receiver?: string
  createdAt: string
  text?: string
  audioUrl?: string
  messageId?: string
  transmissionId?: string
  mode?: 'safe_dynamic' | 'single' | 'multi' | 'exceeded'
  totalSegments?: number
  segments?: AudioSegment[]
  manifest?: Record<string, unknown>
  metadata?: Partial<EncodeResult>
}

export type AnalysisPayload = {
  analysisId: string
  mode?: 'single' | 'grouped'
  sourceType: 'single' | 'grouped'
  normalizedSinglePart?: boolean
  status:
    | 'queued'
    | 'running'
    | 'finalizing'
    | 'complete'
    | 'completed'
    | 'partial'
    | 'failed'
    | 'timed_out'
    | 'invalid_target'
    | 'missing_source'
    | 'not_found'
    | 'cancelled'
  terminal?: boolean
  errorCode?: string | null
  reason?: string | null
  message?: string | null
  elapsedMs?: number | null
  missingParts?: number[]
  filesProcessed?: number
  filesTotal?: number
  transmissionId?: string | null
  selectedPartNumber?: number | null
  selectedPartFilename?: string | null
  revealId?: string | null

  summary: {
    recoveryStatus: 'verified' | 'recovered_with_corrections' | 'partial' | 'failed'
    recoveryConfidence: number
    integrityScore: number
    headerValid: boolean | null
    sequenceValid: boolean | null
    filesProcessed: number
    filesTotal: number
    payloadChunks: number
    ignoredTail: number
    correctionsApplied: boolean
    correctionsCount: number
    missingPartsCount: number
    duplicatePartsCount: number
    overallSnrDb: number | null
    overallMse: number | null
    stftDeltaScore?: number | null
    recoveredText: string | null
    trustMessage: string
  }

  provenance: {
    hasCoverStegoLink: boolean
    grouped: boolean
    transmissionId?: string | null
    assets: Array<{
      partNumber?: number | null
      coverAudioPath?: string | null
      stegoAudioPath?: string | null
      coverAssetId?: string | null
      stegoAssetId?: string | null
    }>
  }

  charts: {
    confidenceByChunk: Array<{
      chunkIndex: number
      confidence: number
      status: 'complete' | 'corrected' | 'low_confidence' | 'missing' | 'duplicate'
    }>
    sequenceProgress: Array<{
      partNumber: number
      status: 'complete' | 'corrected' | 'processing' | 'missing' | 'duplicate'
    }>
    snrByChunk: Array<{
      chunkIndex: number
      snrDb: number | null
    }>
    correctionImpact: Array<{
      chunkIndex: number
      correctionCount: number
      correctionApplied: boolean
    }>
    confidenceTrend: Array<{
      chunkIndex: number
      confidence: number
    }>
    payloadStructure: {
      headerBlocks: number
      payloadBlocks: number
      redundancyBlocks: number
      ignoredTailBlocks: number
      duplicateBlocks: number
    }
    compareSpectrogram?: {
      available: boolean
      coverImageUrl?: string | null
      stegoImageUrl?: string | null
      diffImageUrl?: string | null
      selectedPart?: number
      partOptions?: number[]
    }
    waveformComparison?: {
      available: boolean
      coverWaveform?: Array<{ x: number; y: number }>
      stegoWaveform?: Array<{ x: number; y: number }>
      diffWaveform?: Array<{ x: number; y: number }>
    }
  }

  chunkTable: Array<{
    chunkIndex: number
    partNumber?: number | null
    status: string
    confidence: number | null
    snrDb: number | null
    mse: number | null
    stftDeltaScore?: number | null
    bitAgreement: number | null
    correctionApplied: boolean
    correctionCount: number
    isMissing: boolean
    isDuplicate: boolean
  }>

  recovery: {
    corrected_text: string | null
    raw_text: string | null
    changes: DecodeChange[]
    recovery_status: string | null
  }

  verdict?: unknown
  metrics?: unknown

  legacy?: {
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
  }
}

export type SelectedAudio = {
  messageId: string
  audioUrl?: string
  fileName: string
  source: 'Chat' | 'Encode' | 'Uploaded'
  mode?: 'safe_dynamic' | 'single' | 'multi' | 'exceeded'
  transmissionId?: string
  totalSegments?: number
  segments?: AudioSegment[]
  metadata?: Partial<EncodeResult>
  analysisSourceType?: 'single' | 'grouped'
  selectedPartNumber?: number
  selectedPartFilename?: string
  revealId?: string
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
      type: 'aura_message'
      id: string
      timestamp: string
      message: ChatMessage
    }
  | {
      type: 'file'
      id: string
      timestamp: string
      transfer: AudioTransfer
    }

export type InboxStatus = 'Verified' | 'Pending Reveal' | 'Encrypted'