import type {
  AnalysisPayload,
  AudioTransfer,
  ChatMessage,
  DecodeResult,
  EncodePreview,
  EncodeResult,
  Message,
  SelectedAudio,
  User,
} from '../types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? ''

type SessionResponse = {
  authenticated: boolean
  user: User | null
}

type AnalysisEnvelope = {
  analysis?: AnalysisPayload | null
  payload?: AnalysisPayload | null
  data?: AnalysisPayload | null
  result?: AnalysisPayload | null
  response?: AnalysisPayload | null
  status?: string
  ok?: boolean
  success?: boolean
  error?: string
  message?: string
  [key: string]: unknown
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/api${path}`, {
    credentials: 'include',
    ...init,
    headers:
      init?.body instanceof FormData
        ? init.headers
        : {
            'Content-Type': 'application/json',
            ...(init?.headers ?? {}),
          },
  })

  const data = await response.json().catch(() => ({}))

  if (!response.ok) {
    const errorMessage =
      data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
        ? data.error
        : 'Request failed.'
    throw new Error(errorMessage)
  }

  return data as T
}

export function resolveUrl(path = '') {
  if (!path) return ''
  if (path.startsWith('http://') || path.startsWith('https://')) return path

  // If backend already returned an API route, trust it.
  if (path.startsWith('/api/')) {
    return `${API_BASE_URL}${path}`
  }

  // Preserve raw backend outputs contract.
  // DO NOT rewrite /outputs/* into /api/outputs/*.
if (path.startsWith('/outputs/')) {
  // Force backend origin for static audio files
  return `${API_BASE_URL || 'http://127.0.0.1:5000'}${path}`
}

  // Fallback for other relative paths.
  return `${API_BASE_URL}${path}`
}

export async function getSession(): Promise<SessionResponse> {
  return request<SessionResponse>('/auth/session')
}

export async function login(username: string, password: string): Promise<User> {
  const response = await request<{ user: User }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
  return response.user
}

export async function logout(): Promise<void> {
  await request('/auth/logout', { method: 'POST' })
}

export async function getUsers(): Promise<User[]> {
  const response = await request<{ users: User[] }>('/chat/users')
  return response.users
}

export async function getConversationHistory(otherUsername: string): Promise<Message[]> {
  const response = await request<{ messages: Message[] }>(
    `/chat/history/${encodeURIComponent(otherUsername)}`,
  )
  return response.messages
}

export async function getFiles(direction?: 'received' | 'sent'): Promise<AudioTransfer[]> {
  const query = direction ? `?direction=${direction}` : ''
  const response = await request<{ files: AudioTransfer[] }>(`/files${query}`)
  return response.files
}

export async function uploadWavFile(
  receiver: string,
  file: File,
  customName?: string
): Promise<AudioTransfer> {
  const formData = new FormData()
  formData.append('receiver', receiver)
  formData.append('file', file)

  if (customName) {
    formData.append('custom_name', customName)
  }

  const response = await request<{ file: AudioTransfer }>('/files/upload', {
    method: 'POST',
    body: formData,
  })

  return response.file
}

export function previewEncode(text: string) {
  return request<EncodePreview>('/encode/preview', {
    method: 'POST',
    body: JSON.stringify({ text }),
  })
}

export function encodeAudio(text: string) {
  return request<EncodeResult>('/encode', {
    method: 'POST',
    body: JSON.stringify({ text }),
  })
}

export function decodeByReference(
  messageId: string,
  audioUrl?: string,
  segments?: Array<{ audio_url?: string; audioUrl?: string }>,
) {
  const normalizedSegments = (segments ?? [])
    .map((segment) => segment.audio_url || segment.audioUrl || '')
    .filter((url) => typeof url === 'string' && url.startsWith('/outputs/'))
    .map((audio_url) => ({ audio_url }))

  const body =
    normalizedSegments.length > 1
      ? { segments: normalizedSegments }
      : { message_id: messageId, audio_url: audioUrl }

  return request<DecodeResult>('/decode', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function decodeUpload(file: File) {
  const form = new FormData()
  form.append('file', file)
  return request<DecodeResult>('/decode', {
    method: 'POST',
    body: form,
  })
}

export function decodeUploads(files: File[]) {
  const form = new FormData()
  files.forEach((file) => form.append('files', file))
  return request<DecodeResult>('/decode', {
    method: 'POST',
    body: form,
  })
}



export async function getMessages() {
  const response = await request<{ messages: ChatMessage[] }>('/messages')
  return response.messages
}

export function createMessage(payload: Omit<ChatMessage, 'id'>) {
  return request<ChatMessage>('/messages', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

function inferAnalysisSourceType(target: SelectedAudio): 'single' | 'grouped' {
  if (target.analysisSourceType) return target.analysisSourceType

  const fileName = target.selectedPartFilename || target.fileName || ''
  const partMatch = fileName.match(/^tx_[^_]+_part_(\d+)_of_(\d+)\.wav$/i)

  if (partMatch) {
    const totalParts = Number(partMatch[2])
    return Number.isFinite(totalParts) && totalParts > 1 ? 'grouped' : 'single'
  }

  if (target.mode === 'multi') return 'grouped'
  if ((target.totalSegments ?? 0) > 1) return 'grouped'
  if ((target.segments?.length ?? 0) > 1) return 'grouped'
  if (target.transmissionId && (target.totalSegments ?? 0) !== 1) return 'grouped'

  return 'single'
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeAnalysisStatus(
  status: unknown,
  hasError: boolean,
): AnalysisPayload['status'] {
  if (hasError) return 'failed'

  const normalized = String(status ?? '').toLowerCase()

  if (normalized === 'queued') return 'queued'
  if (normalized === 'running') return 'running'
  if (normalized === 'finalizing') return 'finalizing'
  if (normalized === 'partial') return 'partial'
  if (normalized === 'failed') return 'failed'
  if (normalized === 'timed_out') return 'timed_out'
  if (normalized === 'invalid_target') return 'invalid_target'
  if (normalized === 'missing_source') return 'missing_source'
  if (normalized === 'not_found') return 'not_found'
  if (normalized === 'cancelled') return 'cancelled'
  if (normalized === 'complete') return 'complete'
  if (normalized === 'completed') return 'completed'

  // Safe default for non-error success-ish envelopes
  return 'completed'
}

function hasRenderableAnalysisSignals(obj: Record<string, unknown>): boolean {
  return Boolean(
    typeof obj.status === 'string' ||
      typeof obj.mode === 'string' ||
      typeof obj.sourceType === 'string' ||
      typeof obj.terminal === 'boolean' ||
      typeof obj.message === 'string' ||
      typeof obj.reason === 'string' ||
      typeof obj.error === 'string' ||
      typeof obj.analysisId === 'string' ||
      typeof obj.transmissionId === 'string' ||
      typeof obj.elapsedMs === 'number' ||
      typeof obj.filesProcessed === 'number' ||
      typeof obj.filesTotal === 'number' ||
      Array.isArray(obj.missingParts) ||
      isObject(obj.summary) ||
      isObject(obj.recovery) ||
      isObject(obj.verdict) ||
      isObject(obj.metrics) ||
      isObject(obj.forensics) ||
      isObject(obj.charts) ||
      Array.isArray(obj.chunkTable) ||
      Array.isArray(obj.diagnostics) ||
      Array.isArray(obj.sequence)
  )
}

function buildMinimalAnalysisPayload(
  raw: Record<string, unknown>,
  envelope?: AnalysisEnvelope,
): AnalysisPayload {
  const envelopeStatus = envelope?.status
  const envelopeError = envelope?.error
  const envelopeMessage = envelope?.message

  const rawStatus = typeof raw.status === 'string' ? raw.status : undefined
  const rawSourceType =
    raw.sourceType === 'grouped' || raw.sourceType === 'single'
      ? raw.sourceType
      : undefined
  const rawMode =
    raw.mode === 'grouped' || raw.mode === 'single' ? raw.mode : undefined

  const status = normalizeAnalysisStatus(
    rawStatus ?? envelopeStatus,
    Boolean(typeof raw.error === 'string' ? raw.error : envelopeError),
  )

  const sourceType = rawSourceType ?? rawMode ?? 'single'
  const mode = rawMode ?? sourceType

  const summary = isObject(raw.summary) ? raw.summary : {}
  const provenance = isObject(raw.provenance) ? raw.provenance : {}
  const charts = isObject(raw.charts) ? raw.charts : {}
  const recovery = isObject(raw.recovery) ? raw.recovery : {}

  return {
    ...(raw as Partial<AnalysisPayload>),

    analysisId:
      typeof raw.analysisId === 'string' && raw.analysisId.trim()
        ? raw.analysisId
        : `analysis_${Date.now()}`,

    sourceType,
    mode,

    status,
    terminal:
      typeof raw.terminal === 'boolean'
        ? raw.terminal
        : ['complete', 'completed', 'partial', 'failed', 'timed_out', 'invalid_target', 'missing_source', 'not_found', 'cancelled'].includes(
            status,
          ),

    errorCode:
      typeof raw.errorCode === 'string'
        ? raw.errorCode
        : null,

    reason:
      typeof raw.reason === 'string'
        ? raw.reason
        : typeof raw.error === 'string'
          ? raw.error
          : typeof envelopeError === 'string'
            ? envelopeError
            : null,

    message:
      typeof raw.message === 'string'
        ? raw.message
        : typeof envelopeMessage === 'string'
          ? envelopeMessage
          : null,

    elapsedMs:
      typeof raw.elapsedMs === 'number'
        ? raw.elapsedMs
        : null,

    missingParts: Array.isArray(raw.missingParts)
      ? (raw.missingParts.filter((v) => typeof v === 'number') as number[])
      : [],

    filesProcessed:
      typeof raw.filesProcessed === 'number'
        ? raw.filesProcessed
        : typeof summary.filesProcessed === 'number'
          ? (summary.filesProcessed as number)
          : 0,

    filesTotal:
      typeof raw.filesTotal === 'number'
        ? raw.filesTotal
        : typeof summary.filesTotal === 'number'
          ? (summary.filesTotal as number)
          : 0,

    transmissionId:
      typeof raw.transmissionId === 'string'
        ? raw.transmissionId
        : null,

    selectedPartNumber:
      typeof raw.selectedPartNumber === 'number'
        ? raw.selectedPartNumber
        : null,

    selectedPartFilename:
      typeof raw.selectedPartFilename === 'string'
        ? raw.selectedPartFilename
        : null,

    revealId:
      typeof raw.revealId === 'string'
        ? raw.revealId
        : null,

    summary: {
      recoveryStatus:
        summary.recoveryStatus === 'verified' ||
        summary.recoveryStatus === 'recovered_with_corrections' ||
        summary.recoveryStatus === 'partial' ||
        summary.recoveryStatus === 'failed'
          ? summary.recoveryStatus
          : status === 'failed'
            ? 'failed'
            : 'partial',
      recoveryConfidence:
        typeof summary.recoveryConfidence === 'number' ? summary.recoveryConfidence : 0,
      integrityScore:
        typeof summary.integrityScore === 'number' ? summary.integrityScore : 0,
      headerValid:
        typeof summary.headerValid === 'boolean' ? summary.headerValid : null,
      sequenceValid:
        typeof summary.sequenceValid === 'boolean' ? summary.sequenceValid : null,
      filesProcessed:
        typeof summary.filesProcessed === 'number' ? summary.filesProcessed : 0,
      filesTotal:
        typeof summary.filesTotal === 'number' ? summary.filesTotal : 0,
      payloadChunks:
        typeof summary.payloadChunks === 'number' ? summary.payloadChunks : 0,
      ignoredTail:
        typeof summary.ignoredTail === 'number' ? summary.ignoredTail : 0,
      correctionsApplied:
        typeof summary.correctionsApplied === 'boolean' ? summary.correctionsApplied : false,
      correctionsCount:
        typeof summary.correctionsCount === 'number' ? summary.correctionsCount : 0,
      missingPartsCount:
        typeof summary.missingPartsCount === 'number' ? summary.missingPartsCount : 0,
      duplicatePartsCount:
        typeof summary.duplicatePartsCount === 'number' ? summary.duplicatePartsCount : 0,
      overallSnrDb:
        typeof summary.overallSnrDb === 'number' ? summary.overallSnrDb : null,
      overallMse:
        typeof summary.overallMse === 'number' ? summary.overallMse : null,
      stftDeltaScore:
        typeof summary.stftDeltaScore === 'number' ? summary.stftDeltaScore : null,
      recoveredText:
        typeof summary.recoveredText === 'string'
          ? summary.recoveredText
          : isObject(recovery) && typeof recovery.corrected_text === 'string'
            ? (recovery.corrected_text as string)
            : isObject(recovery) && typeof recovery.raw_text === 'string'
              ? (recovery.raw_text as string)
              : null,
      trustMessage:
        typeof summary.trustMessage === 'string'
          ? summary.trustMessage
          : typeof raw.message === 'string'
            ? raw.message
            : typeof envelopeMessage === 'string'
              ? envelopeMessage
              : 'Aura returned a minimal analysis payload.',
    },

    provenance: {
      hasCoverStegoLink:
        typeof provenance.hasCoverStegoLink === 'boolean'
          ? provenance.hasCoverStegoLink
          : false,
      grouped:
        typeof provenance.grouped === 'boolean'
          ? provenance.grouped
          : sourceType === 'grouped',
      transmissionId:
        typeof provenance.transmissionId === 'string'
          ? provenance.transmissionId
          : typeof raw.transmissionId === 'string'
            ? raw.transmissionId
            : null,
      assets: Array.isArray(provenance.assets)
        ? (provenance.assets as AnalysisPayload['provenance']['assets'])
        : [],
    },

    charts: {
      confidenceByChunk: Array.isArray(charts.confidenceByChunk)
        ? (charts.confidenceByChunk as AnalysisPayload['charts']['confidenceByChunk'])
        : [],
      sequenceProgress: Array.isArray(charts.sequenceProgress)
        ? (charts.sequenceProgress as AnalysisPayload['charts']['sequenceProgress'])
        : [],
      snrByChunk: Array.isArray(charts.snrByChunk)
        ? (charts.snrByChunk as AnalysisPayload['charts']['snrByChunk'])
        : [],
      correctionImpact: Array.isArray(charts.correctionImpact)
        ? (charts.correctionImpact as AnalysisPayload['charts']['correctionImpact'])
        : [],
      confidenceTrend: Array.isArray(charts.confidenceTrend)
        ? (charts.confidenceTrend as AnalysisPayload['charts']['confidenceTrend'])
        : [],
      payloadStructure: isObject(charts.payloadStructure)
        ? {
            headerBlocks:
              typeof charts.payloadStructure.headerBlocks === 'number'
                ? charts.payloadStructure.headerBlocks
                : 0,
            payloadBlocks:
              typeof charts.payloadStructure.payloadBlocks === 'number'
                ? charts.payloadStructure.payloadBlocks
                : 0,
            redundancyBlocks:
              typeof charts.payloadStructure.redundancyBlocks === 'number'
                ? charts.payloadStructure.redundancyBlocks
                : 0,
            ignoredTailBlocks:
              typeof charts.payloadStructure.ignoredTailBlocks === 'number'
                ? charts.payloadStructure.ignoredTailBlocks
                : 0,
            duplicateBlocks:
              typeof charts.payloadStructure.duplicateBlocks === 'number'
                ? charts.payloadStructure.duplicateBlocks
                : 0,
          }
        : {
            headerBlocks: 0,
            payloadBlocks: 0,
            redundancyBlocks: 0,
            ignoredTailBlocks: 0,
            duplicateBlocks: 0,
          },
      compareSpectrogram: isObject(charts.compareSpectrogram)
        ? (charts.compareSpectrogram as AnalysisPayload['charts']['compareSpectrogram'])
        : undefined,
      waveformComparison: isObject(charts.waveformComparison)
        ? (charts.waveformComparison as AnalysisPayload['charts']['waveformComparison'])
        : undefined,
    },

    chunkTable: Array.isArray(raw.chunkTable)
      ? (raw.chunkTable as AnalysisPayload['chunkTable'])
      : [],

    recovery: {
      corrected_text:
        isObject(recovery) && typeof recovery.corrected_text === 'string'
          ? (recovery.corrected_text as string)
          : null,
      raw_text:
        isObject(recovery) && typeof recovery.raw_text === 'string'
          ? (recovery.raw_text as string)
          : null,
      changes:
        isObject(recovery) && Array.isArray(recovery.changes)
          ? (recovery.changes as AnalysisPayload['recovery']['changes'])
          : [],
      recovery_status:
        isObject(recovery) && typeof recovery.recovery_status === 'string'
          ? (recovery.recovery_status as string)
          : null,
    },
  }
}

function coerceAnalysisPayload(raw: unknown, envelope?: AnalysisEnvelope): AnalysisPayload {
  if (!isObject(raw)) {
    throw new Error('Analysis response was empty or invalid.')
  }

  // If backend returned a real or semi-real payload, normalize it into a fully safe payload.
  if (hasRenderableAnalysisSignals(raw)) {
    return buildMinimalAnalysisPayload(raw, envelope)
  }

  // Last resort: any non-empty object becomes a minimal payload instead of a false failure.
  if (Object.keys(raw).length > 0) {
    console.warn('[api] accepting minimal direct analysis payload', {
      keys: Object.keys(raw),
      raw,
    })
    return buildMinimalAnalysisPayload(raw, envelope)
  }

  throw new Error('Analysis response was empty or invalid.')
}

function unwrapAnalysisPayload(raw: unknown): AnalysisPayload {
  if (!isObject(raw)) {
    throw new Error('Analysis response was empty or invalid.')
  }

  const envelope = raw as AnalysisEnvelope

  // Case 1: backend returned payload directly
  try {
    return coerceAnalysisPayload(raw, envelope)
  } catch {
    // continue into envelope checks
  }

  const candidates = [
    envelope.analysis,
    envelope.payload,
    envelope.data,
    envelope.result,
    envelope.response,
  ]

  for (const candidate of candidates) {
    if (isObject(candidate)) {
      try {
        return coerceAnalysisPayload(candidate, envelope)
      } catch {
        // keep trying next candidate
      }
    }
  }

  // Final fallback:
  // Convert any non-empty success-ish envelope into a minimal renderable payload.
  if (
    Object.keys(envelope).length > 0 &&
    (envelope.ok === true ||
      envelope.success === true ||
      typeof envelope.status === 'string' ||
      typeof envelope.message === 'string' ||
      typeof envelope.error === 'string')
  ) {
    console.warn('[api] converting analysis envelope into minimal payload fallback', {
      keys: Object.keys(envelope),
      raw: envelope,
    })

    return buildMinimalAnalysisPayload(envelope as Record<string, unknown>, envelope)
  }

  console.warn('[api] unable to unwrap analysis payload', {
    raw,
    keys: Object.keys(envelope),
  })

  throw new Error('Analysis completed but no usable analysis payload was returned.')
}

export async function getAnalysis(target: SelectedAudio): Promise<AnalysisPayload> {
  const raw = await request<AnalysisPayload | AnalysisEnvelope>('/analysis', {
    method: 'POST',
    body: JSON.stringify({
      messageId: target.messageId,
      sourceType: inferAnalysisSourceType(target),
      transmissionId: target.transmissionId,
      selectedPartNumber: target.selectedPartNumber,
      selectedPartFilename: target.selectedPartFilename || target.fileName,
      totalParts: target.totalSegments,
      audioUrl: target.audioUrl,
      fileName: target.fileName,
    }),
  })

  const payload = unwrapAnalysisPayload(raw)

  console.info('[api] analysis payload accepted', {
    rawType: typeof raw,
    rawKeys: isObject(raw) ? Object.keys(raw) : [],
    status: payload.status,
    mode: payload.mode,
    sourceType: payload.sourceType,
    terminal: payload.terminal,
    hasSummary: Boolean(payload.summary),
    hasRecovery: Boolean(payload.recovery),
    hasChunkTable: Array.isArray(payload.chunkTable),
    hasCharts: Boolean(payload.charts),
  })

  return payload
}
export function getDownloadUrl(transferId: number | string) {
  return `${API_BASE_URL}/api/files/${transferId}/download`
}

export function getAudioUrl(transferId: number | string) {
  return getDownloadUrl(transferId)
}

export async function decodeAudioTransfer(transferId: number | string) {
  const result = await request<DecodeResult & { recoveredText?: string }>(
    `/files/${transferId}/decode`,
    { method: 'POST' },
  )

  return {
    ...result,
    recoveredText: result.recoveredText ?? result.corrected_text ?? result.raw_text,
  }
}